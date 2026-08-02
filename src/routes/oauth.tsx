import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { Panel } from "../components/ui";
import { SUPABASE_SERVICE_ROLE_KEY } from "../lib/env";

export const oauthRoutes = new Hono<AppEnv>();

// ============================================================
// OAuth state helpers — sign with HMAC to prevent CSRF/forgery.
// Format: base64url(tenantId:userId:timestamp:hmac)
// ============================================================

async function hmacSha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createOAuthState(tenantId: string, userId: string): Promise<string> {
  const ts = Date.now();
  const payload = `${tenantId}:${userId}:${ts}`;
  const sig = await hmacSha256(payload);
  const encoded = btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encoded}.${sig}`;
}

async function verifyOAuthState(state: string): Promise<{ tenantId: string; userId: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [encoded = "", sig = ""] = parts;
  try {
    const payload = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const expectedSig = await hmacSha256(payload);
    if (sig !== expectedSig) return null;
    const [tenantId, userId, ts] = payload.split(":");
    if (!tenantId || !userId || !ts) return null;
    // Expire after 10 minutes
    const ageMs = Date.now() - Number(ts);
    if (ageMs > 600_000 || ageMs < 0) return null;
    return { tenantId, userId };
  } catch {
    return null;
  }
}

// Default OAuth scopes for Google Workspace.
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

// GET /oauth/google -- Start Google OAuth flow.
oauthRoutes.get("/google", requireAuth, async (c) => {
  const user = c.get("user");

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "google")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return renderPage(
      c,
      { title: "Integracao Google", active: "integrations" },
      <Panel>
        <h1 class="text-xl font-semibold mb-2">Integracao Google nao encontrada</h1>
        <p class="text-sm text-zinc-600">
          Nao existe uma integracao Google ativa para o seu escritorio. Configure-a
          na pagina de integracoes antes de conectar.
        </p>
        <a href="/integrations" class="text-blue-600 hover:underline mt-3 inline-block">
          Voltar para integracoes
        </a>
      </Panel>,
    );
  }

  const config = (integration.config ?? {}) as {
    client_id?: string;
    redirect_uri?: string;
    scopes?: string;
  };

  if (!config.client_id || !config.redirect_uri) {
    return renderPage(
      c,
      { title: "Integracao Google", active: "integrations" },
      <Panel>
        <h1 class="text-xl font-semibold mb-2">Configuracao incompleta</h1>
        <p class="text-sm text-zinc-600">
          A integracao Google nao possui client_id ou redirect_uri configurados.
        </p>
        <a href="/integrations" class="text-blue-600 hover:underline mt-3 inline-block">
          Voltar para integracoes
        </a>
      </Panel>,
    );
  }

  const state = await createOAuthState(user.tenantId, user.id);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.client_id);
  authUrl.searchParams.set("redirect_uri", config.redirect_uri);
  authUrl.searchParams.set("scope", config.scopes || GOOGLE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return c.redirect(authUrl.toString());
});

// GET /oauth/google/callback -- Handle Google OAuth callback.
oauthRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.redirect("/integrations?error=google_missing_params");
  }

  const stateData = await verifyOAuthState(state);
  if (!stateData) {
    return c.redirect("/integrations?error=google_invalid_state");
  }
  const { tenantId, userId } = stateData;

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("type", "google")
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect("/integrations?error=google_no_integration");
  }

  const config = (integration.config ?? {}) as {
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
  };

  if (!config.client_id || !config.client_secret || !config.redirect_uri) {
    return c.redirect("/integrations?error=google_incomplete_config");
  }

  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: config.redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("Google token exchange failed:", errBody);
      return c.redirect("/integrations?error=google_token_exchange");
    }

    const tokens = (await tokenResp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const userinfoResp = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    const userinfo = (await userinfoResp.json()) as { email?: string };

    await supabase
      .from("integrations")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        connected_email: userinfo.email,
      })
      .eq("tenant_id", tenantId)
      .eq("type", "google");

    return c.redirect("/integrations?success=google_connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return c.redirect("/integrations?error=google_exception");
  }
});

// ---------------------------------------------------------------------------
// Microsoft 365
// ---------------------------------------------------------------------------

// GET /oauth/microsoft -- Start Microsoft OAuth flow.
oauthRoutes.get("/microsoft", requireAuth, async (c) => {
  const user = c.get("user");

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "microsoft")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return renderPage(
      c,
      { title: "Integracao Microsoft", active: "integrations" },
      <Panel>
        <h1 class="text-xl font-semibold mb-2">Integracao Microsoft nao encontrada</h1>
        <p class="text-sm text-zinc-600">
          Nao existe uma integracao Microsoft 365 ativa para o seu escritorio.
          Configure-a na pagina de integracoes antes de conectar.
        </p>
        <a href="/integrations" class="text-blue-600 hover:underline mt-3 inline-block">
          Voltar para integracoes
        </a>
      </Panel>,
    );
  }

  const config = (integration.config ?? {}) as {
    client_id?: string;
    redirect_uri?: string;
    scopes?: string;
    tenant_id?: string;
  };

  if (!config.client_id || !config.redirect_uri || !config.tenant_id) {
    return renderPage(
      c,
      { title: "Integracao Microsoft", active: "integrations" },
      <Panel>
        <h1 class="text-xl font-semibold mb-2">Configuracao incompleta</h1>
        <p class="text-sm text-zinc-600">
          A integracao Microsoft nao possui client_id, redirect_uri ou tenant_id
          configurados.
        </p>
        <a href="/integrations" class="text-blue-600 hover:underline mt-3 inline-block">
          Voltar para integracoes
        </a>
      </Panel>,
    );
  }

  const state = await createOAuthState(user.tenantId, user.id);
  const authUrl = new URL(
    `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/authorize`,
  );
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.client_id);
  authUrl.searchParams.set("redirect_uri", config.redirect_uri);
  authUrl.searchParams.set("scope", config.scopes || "https://graph.microsoft.com/.default");
  authUrl.searchParams.set("state", state);

  return c.redirect(authUrl.toString());
});

// GET /oauth/microsoft/callback -- Handle Microsoft OAuth callback.
oauthRoutes.get("/microsoft/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.redirect("/integrations?error=microsoft_missing_params");
  }

  const stateData = await verifyOAuthState(state);
  if (!stateData) {
    return c.redirect("/integrations?error=microsoft_invalid_state");
  }
  const { tenantId, userId } = stateData;

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("type", "microsoft")
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect("/integrations?error=microsoft_no_integration");
  }

  const config = (integration.config ?? {}) as {
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    scopes?: string;
    tenant_id?: string;
  };

  if (!config.client_id || !config.client_secret || !config.redirect_uri || !config.tenant_id) {
    return c.redirect("/integrations?error=microsoft_incomplete_config");
  }

  try {
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.client_id,
          client_secret: config.client_secret,
          redirect_uri: config.redirect_uri,
          grant_type: "authorization_code",
          scope: config.scopes || "https://graph.microsoft.com/.default",
        }),
      },
    );

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("Microsoft token exchange failed:", errBody);
      return c.redirect("/integrations?error=microsoft_token_exchange");
    }

    const tokens = (await tokenResp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const userResp = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = (await userResp.json()) as { mail?: string; userPrincipalName?: string };

    await supabase
      .from("integrations")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        connected_email: userData.mail || userData.userPrincipalName,
      })
      .eq("tenant_id", tenantId)
      .eq("type", "microsoft");

    return c.redirect("/integrations?success=microsoft_connected");
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return c.redirect("/integrations?error=microsoft_exception");
  }
});

// ---------------------------------------------------------------------------
// DocuSign
// ---------------------------------------------------------------------------

// GET /oauth/docusign -- Start DocuSign OAuth flow.
oauthRoutes.get("/docusign", requireAuth, async (c) => {
  const user = c.get("user");

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", user.tenantId)
    .eq("type", "docusign")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return renderPage(
      c,
      { title: "Integracao DocuSign", active: "integrations" },
      <Panel>
        <h1 class="text-xl font-semibold mb-2">Integracao DocuSign nao encontrada</h1>
        <p class="text-sm text-zinc-600">
          Nao existe uma integracao DocuSign ativa para o seu escritorio.
          Configure-a na pagina de integracoes antes de conectar.
        </p>
        <a href="/integrations" class="text-blue-600 hover:underline mt-3 inline-block">
          Voltar para integracoes
        </a>
      </Panel>,
    );
  }

  const config = (integration.config ?? {}) as {
    client_id?: string;
    redirect_uri?: string;
    environment?: string;
  };

  if (!config.client_id || !config.redirect_uri) {
    return renderPage(
      c,
      { title: "Integracao DocuSign", active: "integrations" },
      <Panel>
        <h1 class="text-xl font-semibold mb-2">Configuracao incompleta</h1>
        <p class="text-sm text-zinc-600">
          A integracao DocuSign nao possui client_id ou redirect_uri configurados.
        </p>
        <a href="/integrations" class="text-blue-600 hover:underline mt-3 inline-block">
          Voltar para integracoes
        </a>
      </Panel>,
    );
  }

  const env = config.environment === "production" ? "" : "d";
  const state = await createOAuthState(user.tenantId, user.id);
  const authUrl = new URL(`https://account-${env}.docusign.com/oauth/auth`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.client_id);
  authUrl.searchParams.set("redirect_uri", config.redirect_uri);
  authUrl.searchParams.set("scope", "signature impersonation");
  authUrl.searchParams.set("state", state);

  return c.redirect(authUrl.toString());
});

// GET /oauth/docusign/callback -- Handle DocuSign OAuth callback.
oauthRoutes.get("/docusign/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code || !state) {
    return c.redirect("/integrations?error=docusign_missing_params");
  }

  const stateData = await verifyOAuthState(state);
  if (!stateData) {
    return c.redirect("/integrations?error=docusign_invalid_state");
  }
  const { tenantId, userId } = stateData;

  const { data: integration } = await supabase
    .from("integrations")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("type", "docusign")
    .limit(1)
    .maybeSingle();

  if (!integration) {
    return c.redirect("/integrations?error=docusign_no_integration");
  }

  const config = (integration.config ?? {}) as {
    client_id?: string;
    client_secret?: string;
    redirect_uri?: string;
    environment?: string;
  };

  if (!config.client_id || !config.client_secret || !config.redirect_uri) {
    return c.redirect("/integrations?error=docusign_incomplete_config");
  }

  const env = config.environment === "production" ? "" : "d";

  try {
    const tokenResp = await fetch(`https://account-${env}.docusign.com/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.client_id,
        client_secret: config.client_secret,
        redirect_uri: config.redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("DocuSign token exchange failed:", errBody);
      return c.redirect("/integrations?error=docusign_token_exchange");
    }

    const tokens = (await tokenResp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    await supabase
      .from("integrations")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("type", "docusign");

    return c.redirect("/integrations?success=docusign_connected");
  } catch (err) {
    console.error("DocuSign OAuth callback error:", err);
    return c.redirect("/integrations?error=docusign_exception");
  }
});
