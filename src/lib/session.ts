import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

export type SessionUser = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  firmName?: string;
};

// Reads the session cookie (a Supabase access token) and resolves the user.
// Returns null if not authenticated or token invalid.
//
// Security: the JWT signature is verified by Supabase's auth server via
// supabase.auth.getUser(token). This prevents forged JWTs from accessing
// the system. The service role client bypasses RLS, so we MUST validate
// the token properly — local decoding without verification is not safe.
export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, "sb-access-token");
  if (!token) return null;

  // Create a temporary client that uses the user's access token.
  // supabase.auth.getUser() verifies the JWT signature against Supabase's JWKS.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error } = await authClient.auth.getUser(token);
  if (error || !authData.user) return null;

  const userId = authData.user.id;
  const userEmail = authData.user.email ?? "";

  // Fetch the profile row (tenant_id, role, full_name) from the profiles table.
  // Uses the service role client (bypasses RLS) — safe because we already
  // verified the JWT above and extracted the real user ID.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, role, email, tenants(name)")
    .eq("id", userId)
    .single();

  if (!profile) return null;

  return {
    id: userId,
    tenantId: profile.tenant_id,
    email: profile.email ?? userEmail,
    fullName: profile.full_name,
    role: profile.role,
    firmName: (profile.tenants as unknown as { name?: string })?.name,
  };
}

// Hono middleware: redirect to /login if not authenticated.
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const user = await getSessionUser(c);
  if (!user) {
    return c.redirect("/login");
  }
  c.set("user", user);
  await next();
}

// Role-based access. Pass allowed roles.
export function requireRole(...roles: string[]) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get("user") as SessionUser | undefined;
    if (!user || !roles.includes(user.role)) {
      return c.html("Acesso negado.", 403);
    }
    await next();
  };
}
