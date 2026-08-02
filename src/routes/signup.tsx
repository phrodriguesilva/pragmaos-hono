import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { provisionTenant, isSignupEnabled } from "../lib/tenant-provisioning";
import { rateLimit } from "../lib/rate-limit";
import { getSessionUser } from "../lib/session";
import { appCss } from "../generated/css";

export const signupRoutes = new Hono<AppEnv>();

// Rate limit: 5 signups per minute per IP (prevents mass account creation)
const signupRateLimit = rateLimit(5, 60_000);

const signupSchema = z.object({
  firm_name: z.string().min(2, "Nome do escritório é obrigatório"),
  admin_name: z.string().min(2, "Nome é obrigatório"),
  admin_email: z.string().email("E-mail inválido"),
  admin_password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  admin_password_confirm: z.string().min(8, "Confirme sua senha"),
  phone: z.string().optional(),
  accept_terms: z.string().refine((v) => v === "on", "Você deve aceitar os Termos de Uso e a Política de Privacidade"),
  // Honeypot — should be empty
  website: z.string().max(0, "spam detected").optional(),
}).refine((data) => data.admin_password === data.admin_password_confirm, {
  message: "As senhas não coincidem",
  path: ["admin_password_confirm"],
});

// ============================================================
// Shared UI helpers (mirrors auth.tsx patterns)
// ============================================================

function signupShell(title: string, children: unknown) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#05111e" />
        <title>{title} — PragmaOS</title>
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/bold/style.css" />
        <script src="/static/js/alpine.min.js" defer />
        <style dangerouslySetInnerHTML={{ __html: appCss }} />
      </head>
      <body class="text-body font-sans min-h-screen flex items-center justify-center p-4 antialiased" style="background: linear-gradient(135deg, #05111e 0%, #1a2634 50%, #05111e 100%);">
        <div class="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl">
          {children}
        </div>
      </body>
    </html>
  );
}

function SignupBrand(subtitle?: string) {
  return (
    <div class="mb-6">
      <div class="flex items-center gap-2.5 mb-2">
        <div class="w-10 h-10 rounded-xl bg-carvao-800 flex items-center justify-center">
          <i class="ph-bold ph-scales text-white text-h3" aria-hidden="true" />
        </div>
        <span class="text-h2 font-bold text-carvao-800 tracking-tight">PragmaOS</span>
      </div>
      {subtitle ? <p class="text-body-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

function ErrorAlert(msg: string) {
  return (
    <div class="border border-status-red bg-status-red-bg text-status-red text-body-sm px-3 py-2 mb-4 flex items-center gap-2">
      <i class="ph ph-warning-circle" aria-hidden="true" />
      {msg}
    </div>
  );
}

function SignupInput(opts: {
  id: string;
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  icon?: string;
  value?: string;
  autofocus?: boolean;
  minlength?: number;
  autocomplete?: string;
}) {
  const { id, name, label, type = "text", placeholder, required, icon, value, autofocus, minlength, autocomplete } = opts;
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
          minlength={minlength}
          autocomplete={autocomplete}
          autofocus={autofocus}
          class={`input w-full${icon ? " pl-7" : ""}`}
        />
      </div>
    </div>
  );
}

// ============================================================
// GET /signup — redirect to dashboard if already authenticated.
signupRoutes.get("/signup", async (c) => {
  const user = await getSessionUser(c);
  if (user) return c.redirect("/dashboard");
  const enabled = await isSignupEnabled();
  if (!enabled) {
    return c.html(
      signupShell("Cadastro indisponível", (
        <>
          {SignupBrand()}
          <div class="text-center py-8">
            <i class="ph-bold ph-lock text-h1 text-gray-400 mb-4 block" aria-hidden="true" />
            <h1 class="text-h3 font-bold text-carvao-800 mb-2">Cadastro temporariamente indisponível</h1>
            <p class="text-body-sm text-gray-500 mb-6">Entre em contato pelo e-mail contato@pragmaos.com.br</p>
            <a href="/login" class="btn btn-secondary inline-flex items-center gap-2">
              <i class="ph ph-arrow-left" aria-hidden="true" /> Voltar para login
            </a>
          </div>
        </>
      )),
    );
  }

  const flashType = parseFlash(c.req.header("cookie") ?? "").type;
  const flashMsg = parseFlash(c.req.header("cookie") ?? "").message;

  return c.html(
    signupShell("Cadastro", (
      <>
        {SignupBrand("Crie sua conta — 14 dias grátis, sem cartão de crédito")}

        {flashType === "error" && flashMsg ? ErrorAlert(flashMsg) : null}
        {flashType === "success" && flashMsg ? (
          <div class="border border-status-green bg-status-green-bg text-status-green text-body-sm px-3 py-2 mb-4 flex items-center gap-2">
            <i class="ph ph-check-circle" aria-hidden="true" />
            {flashMsg}
          </div>
        ) : null}

        <form method="post" action="/signup" class="flex flex-col gap-4" {...{ "x-data": "{ loading: false, pwd: '', confirm: '' }", "@submit": "loading = true" }}>
          {/* Honeypot field — hidden from users, bots fill it */}
          <div class="absolute -left-[9999px] opacity-0" aria-hidden="true">
            <label for="website">Não preencha este campo</label>
            <input type="text" id="website" name="website" tabIndex={-1} autocomplete="off" />
          </div>

          <SignupInput id="firm_name" name="firm_name" label="Nome do escritório" required placeholder="Ex: Silva & Associados" icon="ph-buildings" autofocus autocomplete="organization" />

          <SignupInput id="admin_name" name="admin_name" label="Seu nome" required placeholder="Nome completo" icon="ph-user" autocomplete="name" />

          <SignupInput id="admin_email" name="admin_email" label="E-mail" type="email" required placeholder="voce@escritorio.com" icon="ph-envelope" autocomplete="email" />

          <SignupInput id="admin_password" name="admin_password" label="Senha" type="password" required placeholder="Mínimo 8 caracteres" icon="ph-lock" minlength={8} autocomplete="new-password" />

          {/* Password strength indicator */}
          <div {...{ "x-show": "pwd.length > 0" }} x-cloak class="-mt-2">
            <div class="flex gap-1 h-1">
              <div class="flex-1 rounded-full transition-all" {...{ ":class": "pwd.length >= 8 ? 'bg-status-green' : 'bg-gray-200'" }} />
              <div class="flex-1 rounded-full transition-all" {...{ ":class": "pwd.length >= 12 ? 'bg-status-green' : 'bg-gray-200'" }} />
              <div class="flex-1 rounded-full transition-all" {...{ ":class": "pwd.match(/[A-Z]/) && pwd.match(/[0-9]/) && pwd.match(/[^a-zA-Z0-9]/) ? 'bg-status-green' : 'bg-gray-200'" }} />
            </div>
            <p class="text-xs text-gray-400 mt-1">Use 8+ caracteres com maiúsculas, números e símbolos</p>
          </div>

          <SignupInput id="admin_password_confirm" name="admin_password_confirm" label="Confirmar senha" type="password" required placeholder="Repita sua senha" icon="ph-lock" minlength={8} autocomplete="new-password" />

          <SignupInput id="phone" name="phone" label="Telefone (opcional)" type="tel" placeholder="(11) 99999-9999" icon="ph-phone" autocomplete="tel" />

          {/* Trial info banner */}
          <div class="bg-terracota-50 border border-terracota-200 rounded-lg p-3 flex items-center gap-2 text-body-sm text-terracota-700">
            <i class="ph ph-gift text-h5" aria-hidden="true" />
            <span>Você terá <strong>14 dias grátis</strong> para testar. Escolha seu plano depois, sem pressa.</span>
          </div>

          {/* Terms checkbox */}
          <label class="flex items-start gap-2 text-body-sm text-gray-600 cursor-pointer">
            <input type="checkbox" name="accept_terms" required class="mt-0.5" />
            <span>Aceito os <a href="/termos" class="text-terracota-600 hover:underline" target="_blank">Termos de Uso</a> e a <a href="/privacidade" class="text-terracota-600 hover:underline" target="_blank">Política de Privacidade</a> (LGPD). <span class="text-status-red">*</span></span>
          </label>

          {/* Submit with loading state */}
          <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2" {...{ ":disabled": "loading" }}>
            <i class="ph ph-rocket-launch" {...{ ":class": "loading ? 'ph-spinner animate-spin' : ''" }} aria-hidden="true" />
            <span {...{ "x-show": "!loading" }}>Criar Conta Grátis</span>
            <span {...{ "x-show": "loading", "x-cloak": "" }}>Criando sua conta...</span>
          </button>
        </form>

        <div class="text-center mt-6 text-body-sm text-gray-500">
          Já tem uma conta? <a href="/login" class="text-terracota-600 font-semibold hover:underline">Entrar</a>
        </div>
      </>
    )),
  );
});

// ============================================================
// POST /signup — create tenant (with rate limiting + honeypot)
// ============================================================
signupRoutes.post("/signup", signupRateLimit, async (c) => {
  const enabled = await isSignupEnabled();
  if (!enabled) {
    return c.redirect("/login");
  }

  const body = await c.req.formData();

  // Honeypot check — if filled, silently reject
  const honeypot = String(body.get("website") ?? "").trim();
  if (honeypot) {
    setFlash(c, "success", "Conta criada com sucesso! Faça login para começar.");
    return c.redirect("/login");
  }

  const parsed = signupSchema.safeParse({
    firm_name: body.get("firm_name"),
    admin_name: body.get("admin_name"),
    admin_email: body.get("admin_email"),
    admin_password: body.get("admin_password"),
    admin_password_confirm: body.get("admin_password_confirm"),
    phone: body.get("phone") || undefined,
    accept_terms: body.get("accept_terms") ?? "",
    website: body.get("website") ?? "",
  });

  if (!parsed.success) {
    setFlash(c, "error", parsed.error.issues[0]?.message ?? "Dados inválidos");
    return c.redirect("/signup");
  }

  const result = await provisionTenant({
    firmName: parsed.data.firm_name,
    adminName: parsed.data.admin_name,
    adminEmail: parsed.data.admin_email,
    adminPassword: parsed.data.admin_password,
    plan: "trial", // Always start with trial — plan selection happens later at /assinatura
    phone: parsed.data.phone,
  });

  if (result.success) {
    setFlash(c, "success", "Conta criada com sucesso! Faça login para começar.");
    return c.redirect("/login");
  } else {
    setFlash(c, "error", result.error ?? "Erro ao criar conta");
    return c.redirect("/signup");
  }
});

// Helper: parse flash from cookie.
function parseFlash(cookieHeader: string): { type: string; message: string } {
  const match = cookieHeader.match(/flash-msg=([^;]+)/);
  if (match) {
    try {
      return JSON.parse(decodeURIComponent(match[1]!));
    } catch {
      return { type: "", message: "" };
    }
  }
  return { type: "", message: "" };
}
