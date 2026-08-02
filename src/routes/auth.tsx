import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { AuthLayout } from "../layouts/base";
import { supabase } from "../lib/supabase";
import { APP_URL } from "../lib/env";
import { getSessionUser } from "../lib/session";
import { generateTOTPSecret, validateTOTP, generateQRCodeDataURL, generateBackupCodes, buildTOTPUri } from "../lib/totp";
import { getGovBrAuthUrl, getGovBrConfig, exchangeGovBrCode, getGovBrUserInfo } from "../lib/govbr";
import { appCss } from "../generated/css";
import { loginRateLimit, passwordResetRateLimit, twoFactorRateLimit } from "../lib/rate-limit";

export const authRoutes = new Hono<AppEnv>();

// Hash a token (SHA-256) for secure storage. The plaintext is sent to the user
// via email/URL, but only the hash is stored in the database.
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// Shared UI helpers
// ============================================================

// Auth page wrapper with consistent branding (replaces AuthLayout for pages
// that need a wider card or custom content like QR codes).
function authShell(title: string, children: unknown, opts?: { wide?: boolean }) {
  const maxW = opts?.wide ? "max-w-md" : "max-w-sm";
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#0568ff" />
        <title>{title} - PragmaOS</title>
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css" />
        <script src="/static/js/alpine.min.js" defer />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
      </head>
      <body class="text-body font-sans min-h-screen flex items-center justify-center p-4 antialiased" style="background: linear-gradient(135deg, #0568ff 0%, #4d8bff 50%, #0568ff 100%);">
        <div class={`w-full ${maxW} bg-white p-8 rounded-2xl shadow-2xl`}>
          {children}
        </div>
      </body>
    </html>
  );
}

// Branding header used on all auth pages.
function AuthBrand(subtitle?: string) {
  return (
    <div class="mb-6">
      <img src="/static/img/pragmaos-logo.png" alt="PragmaOS" class="h-10 w-auto mb-2" />
      {subtitle ? <p class="text-body-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

// Error alert box.
function ErrorAlert(msg: string) {
  return (
    <div class="border border-status-red bg-status-red-bg text-status-red text-body-sm px-3 py-2 mb-4 flex items-center gap-2">
      <i class="ph ph-warning-circle" aria-hidden="true" />
      {msg}
    </div>
  );
}

// Success alert box.
function SuccessAlert(msg: string) {
  return (
    <div class="border border-status-green bg-status-green-bg text-status-green text-body-sm px-3 py-2 mb-4 flex items-center gap-2">
      <i class="ph ph-check-circle" aria-hidden="true" />
      {msg}
    </div>
  );
}

// Full-width labeled input with icon, consistent on all auth pages.
function AuthInput(opts: {
  id: string;
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  icon?: string;
  value?: string;
  autofocus?: boolean;
  pattern?: string;
  maxlength?: number;
  autocomplete?: string;
}) {
  const {
    id, name, label, type = "text", placeholder, required, icon, value, autofocus, pattern, maxlength, autocomplete,
  } = opts;
  return (
    <div class="flex flex-col gap-1">
      <label for={id} class="text-body-sm font-semibold text-gray-700">
        {label}{required ? <span class="text-status-red"> *</span> : null}
      </label>
      <div class="relative">
        {icon ? <i class={`ph ${icon} absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400`} aria-hidden="true" /> : null}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          pattern={pattern}
          maxlength={maxlength}
          autocomplete={autocomplete}
          autofocus={autofocus}
          class={`input w-full${icon ? " pl-7" : ""}`}
        />
      </div>
    </div>
  );
}

// Full-width primary submit button.
const AuthButton = ({ icon, label }: { icon: string; label: string }) => (
  <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2">
    <i class={`ph ${icon}`} aria-hidden="true" />
    {label}
  </button>
);

// ============================================================
// Login
// ============================================================

function loginForm(errorMsg?: string, emailValue?: string) {
  return (
    <AuthLayout title="Entrar">
      <p class="text-body-sm text-gray-500 mb-6 text-center">Gestão jurídica para escritórios.</p>
      {errorMsg ? ErrorAlert(errorMsg) : null}
      <form method="post" action="/login" class="flex flex-col gap-4" {...{ "x-data": "{ loading: false }", "@submit": "loading = true" }}>
        <AuthInput id="email" name="email" label="Email" type="email" required icon="ph-envelope"
          placeholder="voce@escritorio.com" value={emailValue} autocomplete="email" />
        <div class="flex flex-col gap-1">
          <label for="password" class="text-body-sm font-semibold text-gray-700">
            Senha<span class="text-status-red"> *</span>
          </label>
          <div {...{ "x-data": "{ show: false }" }} class="relative">
            <i class="ph ph-lock absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400" aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="********"
              autocomplete="current-password"
              class="input w-full pl-7 pr-8"
              {...{ ":type": "show ? 'text' : 'password'" }}
            />
            <button
              type="button"
              {...{ "@click": "show = !show" }}
              aria-label="Mostrar senha"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <i {...{ ":class": "show ? 'ph ph-eye-slash' : 'ph ph-eye'" }} class="ph ph-eye text-body" aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Remember me */}
        <label class="flex items-center gap-2 text-body-sm text-gray-600 cursor-pointer">
          <input type="checkbox" name="remember" class="rounded" />
          <span>Lembrar de mim neste dispositivo</span>
        </label>
        <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2" {...{ ":disabled": "loading" }}>
          <i class={`ph ${"loading ? 'ph-spinner animate-spin' : 'ph-sign-in'"}`} aria-hidden="true" />
          <span {...{ "x-show": "!loading" }}>Entrar</span>
          <span {...{ "x-show": "loading", "x-cloak": "" }}>Entrando...</span>
        </button>
        <div class="text-center">
          <a href="/forgot-password" class="text-body-sm text-[#0568ff] hover:underline">
            Esqueceu sua senha?
          </a>
        </div>
      </form>
      {/* Gov.br OAuth login */}
      <div class="mt-6 pt-6 border-t border-gray-100">
        <div class="text-center text-body-xs text-gray-400 mb-3">ou</div>
        <a href="/auth/govbr" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-body-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="20" height="20" rx="4" fill="#003B7B"/>
            <text x="10" y="14" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="Arial">gov.br</text>
          </svg>
          Entrar com Gov.br
        </a>
        <div class="text-center mt-4">
          <a href="/signup" class="text-body-sm text-[#0568ff] hover:underline">
            Não tem conta? Cadastre-se (14 dias grátis)
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}

// GET /login — redirect to dashboard if already authenticated.
authRoutes.get("/login", async (c) => {
  const user = await getSessionUser(c);
  if (user) return c.redirect("/dashboard");
  return c.html(loginForm());
});

// POST /login -- authenticate, check 2FA, redirect accordingly.
authRoutes.post("/login", loginRateLimit, async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const remember = String(body.remember ?? "") === "on";

  if (!email || !password) {
    return c.html(loginForm("Email e senha são obrigatórios.", email));
  }

  // Authenticate via Supabase Auth.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return c.html(loginForm("Credenciais inválidas.", email));
  }

  // Extend session if "remember me" is checked (30 days vs default 1 hour).
  const sessionMaxAge = remember ? 30 * 24 * 60 * 60 : (data.session.expires_in ?? 3600);

  // Look up the user's profile to get tenant_id and check 2FA status.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("email", email)
    .single();

  // Set the access token as an HttpOnly cookie (pending 2FA if needed).
  setCookie(c, "sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "Strict",
    path: "/",
    maxAge: sessionMaxAge,
  });

  // Store the user ID in a short-lived cookie for 2FA flow.
  if (profile) {
    setCookie(c, "auth-user-id", profile.id, {
      httpOnly: true,
      secure: APP_URL.startsWith("https"),
      sameSite: "Strict",
      path: "/",
      maxAge: 600, // 10 minutes to complete 2FA
    });

    // Check if user has 2FA enabled.
    const { data: totpRow } = await supabase
      .from("user_totp")
      .select("enabled")
      .eq("user_id", profile.id)
      .eq("enabled", true)
      .single();

    if (totpRow?.enabled) {
      // Log 2FA challenge.
      await supabase.from("auth_logs").insert({
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        email,
        event_type: "2fa_challenge",
        ip_address: c.req.header("x-forwarded-for") ?? null,
        user_agent: c.req.header("user-agent") ?? null,
        success: true,
      });
      return c.redirect("/2fa/verify");
    }

    // Log successful login.
    await supabase.from("auth_logs").insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      email,
      event_type: "login",
      ip_address: c.req.header("x-forwarded-for") ?? null,
      user_agent: c.req.header("user-agent") ?? null,
      success: true,
    });
  }

  return c.redirect("/dashboard");
});

// ============================================================
// 2FA Verify (login with 2FA already enabled)
// ============================================================

function twoFAVerifyForm(errorMsg?: string) {
  return (
    <AuthLayout title="Verificação 2FA">
      <div class="flex items-center gap-2 mb-1">
        <i class="ph-bold ph-shield-check text-h2 text-[#0568ff]" aria-hidden="true" />
        <h1 class="text-h2 font-bold text-gray-900">Verificação 2FA</h1>
      </div>
      <p class="text-body-sm text-gray-500 mb-6">
        Digite o código de 6 dígitos do seu app autenticador.
      </p>
      {errorMsg ? ErrorAlert(errorMsg) : null}
      <form method="post" action="/2fa/verify" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="code" class="text-body-sm font-semibold text-gray-700">
            Código de verificação<span class="text-status-red"> *</span>
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            required
            pattern="[0-9]{6}"
            maxlength={6}
            autofocus
            placeholder="000000"
            class="input w-full text-center text-h3 tracking-[0.3em] font-mono"
            autocomplete="one-time-code"
          />
        </div>
        <AuthButton icon="ph-shield-check" label="Verificar" />
        <div class="text-center">
          <a href="/login" class="text-body-sm text-gray-500 hover:underline">
            Voltar para o login
          </a>
        </div>
      </form>
    </AuthLayout>
  );
}

// GET /2fa/verify
authRoutes.get("/2fa/verify", (c) => {
  const userId = getCookie(c, "auth-user-id");
  if (!userId) return c.redirect("/login");
  return c.html(twoFAVerifyForm());
});

// POST /2fa/verify
authRoutes.post("/2fa/verify", twoFactorRateLimit, async (c) => {
  const userId = getCookie(c, "auth-user-id");
  if (!userId) return c.redirect("/login");

  const body = await c.req.parseBody();
  const code = String(body.code ?? "").trim();

  if (!code || code.length !== 6) {
    return c.html(twoFAVerifyForm("O código deve ter 6 dígitos."));
  }

  // Fetch the user's TOTP secret.
  const { data: totpRow } = await supabase
    .from("user_totp")
    .select("secret, tenant_id")
    .eq("user_id", userId)
    .eq("enabled", true)
    .single();

  if (!totpRow) {
    return c.redirect("/login");
  }

  // Validate the TOTP code.
  if (!validateTOTP(code, totpRow.secret)) {
    // Log failed 2FA attempt.
    await supabase.from("auth_logs").insert({
      tenant_id: totpRow.tenant_id,
      user_id: userId,
      event_type: "2fa_verify_failed",
      ip_address: c.req.header("x-forwarded-for") ?? null,
      user_agent: c.req.header("user-agent") ?? null,
      success: false,
    });
    return c.html(twoFAVerifyForm("Código inválido. Tente novamente."));
  }

  // Log successful 2FA.
  await supabase.from("auth_logs").insert({
    tenant_id: totpRow.tenant_id,
    user_id: userId,
    event_type: "2fa_verify_success",
    ip_address: c.req.header("x-forwarded-for") ?? null,
    user_agent: c.req.header("user-agent") ?? null,
    success: true,
  });

  // Clear the pending 2FA cookie.
  deleteCookie(c, "auth-user-id", { path: "/" });

  return c.redirect("/dashboard");
});

// ============================================================
// 2FA Setup (enroll for the first time, from profile)
// ============================================================

async function twoFASetupForm(qrDataUrl?: string, secret?: string, backupCodes?: string[], errorMsg?: string, success?: boolean) {
  return (
    <AuthLayout title="Configurar 2FA">
      <div class="flex items-center gap-2 mb-1">
        <i class="ph-bold ph-shield-star text-h2 text-[#0568ff]" aria-hidden="true" />
        <h1 class="text-h2 font-bold text-gray-900">Configurar 2FA</h1>
      </div>
      <p class="text-body-sm text-gray-500 mb-6">
        Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, 1Password, etc).
      </p>
      {errorMsg ? ErrorAlert(errorMsg) : null}
      {success ? SuccessAlert("2FA ativado com sucesso!") : null}

      {qrDataUrl ? (
        <>
          <div class="text-center mb-4">
            <img src={qrDataUrl} alt="QR Code para 2FA" class="inline-block border border-gray-200" width="200" height="200" />
          </div>
          <div class="mb-4">
            <p class="text-body-sm text-gray-600 mb-1">Ou digite o código manualmente:</p>
            <div class="text-body-sm text-gray-800 border border-gray-200 bg-gray-50 p-2 break-all font-mono">
              {secret}
            </div>
          </div>
          <form method="post" action="/2fa/setup" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <label for="code" class="text-body-sm font-semibold text-gray-700">
                Digite o código de 6 dígitos<span class="text-status-red"> *</span>
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                required
                pattern="[0-9]{6}"
                maxlength={6}
                autofocus
                placeholder="000000"
                class="input w-full text-center text-h3 tracking-[0.3em] font-mono"
                autocomplete="one-time-code"
              />
            </div>
            <AuthButton icon="ph-check" label="Confirmar e ativar" />
          </form>
        </>
      ) : (
        <form method="post" action="/2fa/setup" class="flex flex-col gap-4">
          <AuthButton icon="ph-qr-code" label="Gerar QR Code" />
        </form>
      )}

      {backupCodes && backupCodes.length > 0 ? (
        <div class="mt-6 border-t border-gray-200 pt-4">
          <p class="text-body-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
            <i class="ph ph-key" aria-hidden="true" />Códigos de recuperação
          </p>
          <p class="text-body-sm text-gray-500 mb-2">
            Guarde estes codigos em local seguro. Use-os se perder acesso ao seu app autenticador.
          </p>
          <div class="grid grid-cols-2 gap-1 border border-gray-200 bg-gray-50 p-3 font-mono text-body-sm">
            {backupCodes.map((code) => <div key={code}>{code}</div>)}
          </div>
          <p class="text-body-sm text-status-red mt-2 flex items-center gap-1">
            <i class="ph ph-warning" aria-hidden="true" />Estes códigos não serão exibidos novamente.
          </p>
        </div>
      ) : null}

      <div class="mt-4 text-center">
        <a href="/profile" class="text-body-sm text-gray-500 hover:underline">Voltar para o perfil</a>
      </div>
    </AuthLayout>
  );
}

// GET /2fa/setup -- show QR code (generate if not yet stored).
authRoutes.get("/2fa/setup", async (c) => {
  const userId = getCookie(c, "auth-user-id");
  const accessToken = getCookie(c, "sb-access-token");

  // If coming from login flow (auth-user-id cookie), use that.
  // Otherwise, try to get the user from the access token.
  let targetUserId = userId;

  if (!targetUserId && accessToken) {
    const { data: userData } = await supabase.auth.getUser(accessToken);
    if (userData.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email, tenant_id")
        .eq("email", userData.user.email)
        .single();
      if (profile) targetUserId = profile.id;
    }
  }

  if (!targetUserId) return c.redirect("/login");

  // Check if 2FA is already enabled.
  const { data: existing } = await supabase
    .from("user_totp")
    .select("secret, enabled")
    .eq("user_id", targetUserId)
    .single();

  if (existing?.enabled) {
    // Already enabled, redirect to profile with message.
    return c.redirect("/profile?2fa=already");
  }

  // If we have a secret but not enabled, use it. Otherwise generate a new one.
  let secret = existing?.secret;
  let qrDataUrl: string | undefined;

  if (!secret) {
    // Need email to generate TOTP URI.
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, tenant_id")
      .eq("id", targetUserId)
      .single();

    if (!profile) return c.redirect("/login");

    const generated = generateTOTPSecret(profile.email);
    secret = generated.secret;
    qrDataUrl = await generateQRCodeDataURL(generated.uri);

    // Store the secret (not yet enabled).
    await supabase.from("user_totp").upsert({
      tenant_id: profile.tenant_id,
      user_id: targetUserId,
      secret,
      enabled: false,
    });
  } else {
    // Regenerate QR from existing secret.
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", targetUserId)
      .single();

    if (profile) {
      const uri = buildTOTPUri(profile.email, secret);
      qrDataUrl = await generateQRCodeDataURL(uri);
    }
  }

  return c.html(await twoFASetupForm(qrDataUrl, secret));
});

// POST /2fa/setup -- confirm TOTP code and enable 2FA.
authRoutes.post("/2fa/setup", async (c) => {
  const userId = getCookie(c, "auth-user-id");
  const accessToken = getCookie(c, "sb-access-token");

  let targetUserId = userId;
  if (!targetUserId && accessToken) {
    const { data: userData } = await supabase.auth.getUser(accessToken);
    if (userData.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", userData.user.email)
        .single();
      if (profile) targetUserId = profile.id;
    }
  }

  if (!targetUserId) return c.redirect("/login");

  const body = await c.req.parseBody();
  const code = String(body.code ?? "").trim();

  // If no code, generate QR (first visit).
  if (!code) {
    return c.redirect("/2fa/setup");
  }

  if (code.length !== 6) {
    return c.html(await twoFASetupForm(undefined, undefined, undefined, "O código deve ter 6 dígitos."));
  }

  // Fetch stored secret.
  const { data: totpRow } = await supabase
    .from("user_totp")
    .select("secret, tenant_id")
    .eq("user_id", targetUserId)
    .single();

  if (!totpRow) {
    return c.redirect("/2fa/setup");
  }

  if (!validateTOTP(code, totpRow.secret)) {
    return c.html(await twoFASetupForm(undefined, totpRow.secret, undefined, "Código inválido. Tente novamente."));
  }

  // Generate backup codes.
  const backupCodes = generateBackupCodes();

  // Enable 2FA.
  await supabase.from("user_totp").update({
    enabled: true,
    backup_codes: backupCodes,
  }).eq("user_id", targetUserId);

  // Log 2FA enrollment.
  await supabase.from("auth_logs").insert({
    tenant_id: totpRow.tenant_id,
    user_id: targetUserId,
    event_type: "2fa_enabled",
    ip_address: c.req.header("x-forwarded-for") ?? null,
    user_agent: c.req.header("user-agent") ?? null,
    success: true,
  });

  // Clear pending cookie if from login flow.
  deleteCookie(c, "auth-user-id", { path: "/" });

  // Show success with backup codes.
  return c.html(await twoFASetupForm(undefined, undefined, backupCodes, undefined, true));
});

// ============================================================
// Forgot Password
// ============================================================

function forgotPasswordForm(errorMsg?: string, success?: boolean) {
  return (
    <AuthLayout title="Recuperar Senha">
      <div class="flex items-center gap-2 mb-1">
        <i class="ph-bold ph-envelope-simple-open text-h2 text-[#0568ff]" aria-hidden="true" />
        <h1 class="text-h2 font-bold text-gray-900">Recuperar Senha</h1>
      </div>
      <p class="text-body-sm text-gray-500 mb-6">
        Digite seu email e enviaremos um link para redefinir sua senha.
      </p>
      {errorMsg ? ErrorAlert(errorMsg) : null}
      {success ? SuccessAlert("Se o email existir, enviamos um link de recuperacao.") : null}
      <form method="post" action="/forgot-password" class="flex flex-col gap-4">
        <AuthInput id="email" name="email" label="Email" type="email" required icon="ph-envelope"
          placeholder="voce@escritorio.com" autocomplete="email" />
        <AuthButton icon="ph-paper-plane-tilt" label="Enviar link" />
        <div class="text-center">
          <a href="/login" class="text-body-sm text-gray-500 hover:underline">Voltar para o login</a>
        </div>
      </form>
    </AuthLayout>
  );
}

// GET /forgot-password
authRoutes.get("/forgot-password", (c) => c.html(forgotPasswordForm()));

// POST /forgot-password -- generate reset token and "send" email.
authRoutes.post("/forgot-password", passwordResetRateLimit, async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!email) {
    return c.html(forgotPasswordForm("Email é obrigatório."));
  }

  // Check if user exists.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, email")
    .eq("email", email)
    .single();

  // Always show success to prevent email enumeration.
  if (profile) {
    // Generate a reset token.
    const token = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate previous tokens (scoped to tenant).
    await supabase.from("password_resets").update({ used: true }).eq("email", email).eq("tenant_id", profile.tenant_id).eq("used", false);

    // Insert new token (store hash, not plaintext).
    await supabase.from("password_resets").insert({
      tenant_id: profile.tenant_id,
      email,
      token: tokenHash,
      expires_at: expiresAt.toISOString(),
      used: false,
    });

    // Log the request.
    await supabase.from("auth_logs").insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      email,
      event_type: "password_reset_requested",
      ip_address: c.req.header("x-forwarded-for") ?? null,
      user_agent: c.req.header("user-agent") ?? null,
      success: true,
    });

    // In production, send email with reset link. For now, we log it.
    // The reset URL is: /reset-password?token=XXX
    console.log(`[Password Reset] Link para ${email}: ${APP_URL}/reset-password?token=${token}`);
  }

  return c.html(forgotPasswordForm(undefined, true));
});

// ============================================================
// Reset Password
// ============================================================

function resetPasswordForm(token: string, errorMsg?: string, success?: boolean) {
  return (
    <AuthLayout title="Redefinir Senha">
      <div class="flex items-center gap-2 mb-1">
        <i class="ph-bold ph-key text-h2 text-[#0568ff]" aria-hidden="true" />
        <h1 class="text-h2 font-bold text-gray-900">Redefinir Senha</h1>
      </div>
      <p class="text-body-sm text-gray-500 mb-6">Digite sua nova senha.</p>
      {errorMsg ? ErrorAlert(errorMsg) : null}
      {success ? SuccessAlert("Senha redefinida com sucesso! Faca login.") : null}
      <form method="post" action={`/reset-password?token=${token}`} class="flex flex-col gap-4">
        <div {...{ "x-data": "{ show: false }" }} class="flex flex-col gap-1">
          <label for="password" class="text-body-sm font-semibold text-gray-700">
            Nova senha<span class="text-status-red"> *</span>
          </label>
          <div class="relative">
            <i class="ph ph-lock absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400" aria-hidden="true" />
            <input
              id="password"
              name="password"
              type="password"
              required
              minlength={6}
              placeholder="Minimo 6 caracteres"
              autocomplete="new-password"
              class="input w-full pl-7 pr-8"
              {...{ ":type": "show ? 'text' : 'password'" }}
            />
            <button
              type="button"
              {...{ "@click": "show = !show" }}
              aria-label="Mostrar senha"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <i {...{ ":class": "show ? 'ph ph-eye-slash' : 'ph ph-eye'" }} class="ph ph-eye text-body" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div {...{ "x-data": "{ show: false }" }} class="flex flex-col gap-1">
          <label for="confirm_password" class="text-body-sm font-semibold text-gray-700">
            Confirmar senha<span class="text-status-red"> *</span>
          </label>
          <div class="relative">
            <i class="ph ph-lock absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400" aria-hidden="true" />
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              minlength={6}
              placeholder="Repita a nova senha"
              autocomplete="new-password"
              class="input w-full pl-7 pr-8"
              {...{ ":type": "show ? 'text' : 'password'" }}
            />
            <button
              type="button"
              {...{ "@click": "show = !show" }}
              aria-label="Mostrar senha"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
            >
              <i {...{ ":class": "show ? 'ph ph-eye-slash' : 'ph ph-eye'" }} class="ph ph-eye text-body" aria-hidden="true" />
            </button>
          </div>
        </div>
        <AuthButton icon="ph-check" label="Redefinir senha" />
        <div class="text-center">
          <a href="/login" class="text-body-sm text-gray-500 hover:underline">Voltar para o login</a>
        </div>
      </form>
    </AuthLayout>
  );
}

// GET /reset-password
authRoutes.get("/reset-password", async (c) => {
  const token = c.req.query("token") ?? "";
  if (!token) {
    return c.html(
      <AuthLayout title="Link Inválido">
        {AuthBrand("Redefinição de senha")}
        {ErrorAlert("Link de recuperação inválido ou ausente.")}
        <a href="/forgot-password" class="btn btn-secondary w-full flex items-center justify-center gap-2">
          <i class="ph ph-arrow-left" aria-hidden="true" />Solicitar novo link
        </a>
      </AuthLayout>,
    );
  }

  // Verify token is valid and not expired (hash the incoming token before lookup).
  const tokenHash = await hashToken(token);
  const { data: resetRow } = await supabase
    .from("password_resets")
    .select("email, expires_at, used")
    .eq("token", tokenHash)
    .single();

  if (!resetRow || resetRow.used || new Date(resetRow.expires_at) < new Date()) {
    return c.html(
      <AuthLayout title="Link Expirado">
        {AuthBrand("Redefinição de senha")}
        {ErrorAlert("Este link de recuperacao expirou ou ja foi usado.")}
        <a href="/forgot-password" class="btn btn-secondary w-full flex items-center justify-center gap-2">
          <i class="ph ph-arrow-left" aria-hidden="true" />Solicitar novo link
        </a>
      </AuthLayout>,
    );
  }

  return c.html(resetPasswordForm(token));
});

// POST /reset-password -- update password with valid token.
authRoutes.post("/reset-password", passwordResetRateLimit, async (c) => {
  const token = c.req.query("token") ?? "";
  const body = await c.req.parseBody();
  const password = String(body.password ?? "");
  const confirmPassword = String(body.confirm_password ?? "");

  if (!token) {
    return c.html(resetPasswordForm("", "Token inválido."));
  }

  if (!password || password.length < 6) {
    return c.html(resetPasswordForm(token, "A senha deve ter no minimo 6 caracteres."));
  }

  if (password !== confirmPassword) {
    return c.html(resetPasswordForm(token, "As senhas não coincidem."));
  }

  // Verify token (hash before lookup).
  const tokenHash = await hashToken(token);
  const { data: resetRow } = await supabase
    .from("password_resets")
    .select("email, expires_at, used, tenant_id, user_id")
    .eq("token", tokenHash)
    .single();

  if (!resetRow || resetRow.used || new Date(resetRow.expires_at) < new Date()) {
    return c.html(resetPasswordForm(token, "Link expirado ou inválido."));
  }

  // Update password via Supabase Admin API.
  const { error } = await supabase.auth.admin.updateUserById(
    resetRow.user_id,
    { password },
  );

  if (error) {
    return c.html(resetPasswordForm(token, `Erro ao redefinir senha: ${error.message}`));
  }

  // Mark token as used (scoped to tenant).
  await supabase.from("password_resets").update({ used: true }).eq("token", tokenHash).eq("tenant_id", resetRow.tenant_id);

  // Log the reset.
  await supabase.from("auth_logs").insert({
    tenant_id: resetRow.tenant_id,
    user_id: resetRow.user_id,
    email: resetRow.email,
    event_type: "password_reset_completed",
    ip_address: c.req.header("x-forwarded-for") ?? null,
    user_agent: c.req.header("user-agent") ?? null,
    success: true,
  });

  return c.html(resetPasswordForm(token, undefined, true));
});

// ============================================================
// Logout
// ============================================================

// POST /logout
authRoutes.post("/logout", async (c) => {
  deleteCookie(c, "sb-access-token", { path: "/" });
  deleteCookie(c, "auth-user-id", { path: "/" });
  return c.redirect("/login");
});

// GET /logout
authRoutes.get("/logout", (c) => {
  deleteCookie(c, "sb-access-token", { path: "/" });
  deleteCookie(c, "auth-user-id", { path: "/" });
  return c.redirect("/login");
});

// ============================================================
// Gov.br OAuth
// ============================================================

// GET /auth/govbr — redirect to Gov.br authorization
authRoutes.get("/govbr", (c) => {
  const config = getGovBrConfig();
  if (!config.enabled) {
    return c.html(loginForm("Login via Gov.br não configurado. Contate o administrador."));
  }
  const state = crypto.randomUUID();
  setCookie(c, "govbr-oauth-state", state, { path: "/", httpOnly: true, maxAge: 600, secure: APP_URL.startsWith("https"), sameSite: "Strict" });
  return c.redirect(getGovBrAuthUrl(state));
});

// GET /auth/govbr/callback — handle Gov.br OAuth callback
authRoutes.get("/govbr/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const savedState = getCookie(c, "govbr-oauth-state");
  deleteCookie(c, "govbr-oauth-state", { path: "/" });

  if (!code || !state || state !== savedState) {
    return c.html(loginForm("Erro na autenticação Gov.br: state inválido."));
  }

  const tokenResult = await exchangeGovBrCode(code);
  if (!tokenResult.success || !tokenResult.token) {
    return c.html(loginForm(tokenResult.error ?? "Erro ao obter token Gov.br."));
  }

  const userInfoResult = await getGovBrUserInfo(tokenResult.token.access_token);
  if (!userInfoResult.success || !userInfoResult.user) {
    return c.html(loginForm(userInfoResult.error ?? "Erro ao obter dados do usuario Gov.br."));
  }

  const govUser = userInfoResult.user;

  // Look up user by CPF in profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, role")
    .eq("cpf", govUser.cpf.replace(/\D/g, ""))
    .maybeSingle();

  if (!profile) {
    return c.html(loginForm(`Usuário com CPF ${govUser.cpf} não encontrado no PragmaOS. Contate o administrador.`));
  }

  // Set session cookies (same as regular login)
  setCookie(c, "sb-access-token", tokenResult.token.access_token, { path: "/", httpOnly: true, maxAge: 86400, secure: APP_URL.startsWith("https"), sameSite: "Strict" });
  setCookie(c, "auth-user-id", profile.id, { path: "/", httpOnly: true, maxAge: 86400, secure: APP_URL.startsWith("https"), sameSite: "Strict" });

  return c.redirect("/dashboard");
});
