import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { provisionTenant, isSignupEnabled } from "../lib/tenant-provisioning";

export const signupRoutes = new Hono<AppEnv>();

const signupSchema = z.object({
  firm_name: z.string().min(2, "Nome do escritorio e obrigatorio"),
  admin_name: z.string().min(2, "Nome e obrigatorio"),
  admin_email: z.string().email("E-mail invalido"),
  admin_password: z.string().min(8, "Senha deve ter no minimo 8 caracteres"),
  plan: z.enum(["trial", "starter", "pro", "enterprise"]).default("trial"),
  phone: z.string().optional(),
});

// GET /signup — signup form.
signupRoutes.get("/signup", async (c) => {
  const enabled = await isSignupEnabled();
  if (!enabled) {
    return c.html(
      `<html><body style="font-family: sans-serif; text-align: center; padding: 4rem;">
        <h1>Cadastro temporariamente indisponivel</h1>
        <p>Entre em contato pelo e-mail contato@pragmaos.com.br</p>
      </body></html>`,
    );
  }

  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Cadastro — PragmaOS</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f4f6; margin: 0; padding: 2rem; }
        .container { max-width: 500px; margin: 0 auto; background: white; border-radius: 0.75rem; padding: 2.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .logo { text-align: center; margin-bottom: 1.5rem; }
        .logo h1 { font-size: 1.75rem; color: #1f2937; margin: 0; }
        .logo p { color: #6b7280; font-size: 0.875rem; margin: 0.25rem 0 0; }
        .field { margin-bottom: 1rem; }
        .field label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem; }
        .field input, .field select { width: 100%; padding: 0.625rem; border: 1px solid #d1d5db; border-radius: 0.5rem; font-size: 0.875rem; }
        .field input:focus, .field select:focus { outline: none; border-color: #c2410c; box-shadow: 0 0 0 2px rgba(194, 65, 12, 0.2); }
        .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem; }
        .plan { border: 2px solid #e5e7eb; border-radius: 0.5rem; padding: 0.75rem; cursor: pointer; text-align: center; }
        .plan.selected { border-color: #c2410c; background: #fff7ed; }
        .plan-name { font-weight: 600; font-size: 0.875rem; }
        .plan-price { font-size: 0.75rem; color: #6b7280; }
        button { background: #c2410c; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 0.5rem; }
        button:hover { background: #9a3412; }
        .flash { padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
        .flash.error { background: #fee2e2; color: #991b1b; }
        .flash.success { background: #d1fae5; color: #065f46; }
        .login-link { text-align: center; margin-top: 1.5rem; font-size: 0.875rem; color: #6b7280; }
        .login-link a { color: #c2410c; text-decoration: none; }
        .login-link a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <h1>PragmaOS</h1>
          <p>Crie sua conta — 14 dias gratis</p>
        </div>

        ${(parseFlash(c.req.header("cookie") ?? "").type === "error" || parseFlash(c.req.header("cookie") ?? "").type === "success") ?
          `<div class="flash ${parseFlash(c.req.header("cookie") ?? "").type}">${parseFlash(c.req.header("cookie") ?? "").message}</div>` : ""}

        <form method="post" action="/signup">
          <div class="field">
            <label>Nome do escritorio</label>
            <input type="text" name="firm_name" required placeholder="Ex: Silva & Associados Advocacia" />
          </div>
          <div class="field">
            <label>Seu nome</label>
            <input type="text" name="admin_name" required placeholder="Nome completo" />
          </div>
          <div class="field">
            <label>E-mail</label>
            <input type="email" name="admin_email" required placeholder="voce@escritorio.com" />
          </div>
          <div class="field">
            <label>Senha</label>
            <input type="password" name="admin_password" required minlength="8" placeholder="Minimo 8 caracteres" />
          </div>
          <div class="field">
            <label>Telefone (opcional)</label>
            <input type="tel" name="phone" placeholder="(11) 99999-9999" />
          </div>

          <label style="font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.5rem; display: block;">Plano</label>
          <div class="plans">
            <div class="plan selected" onclick="document.querySelectorAll('.plan').forEach(p => p.classList.remove('selected')); this.classList.add('selected'); document.getElementById('plan-input').value = 'trial';">
              <div class="plan-name">Trial</div>
              <div class="plan-price">14 dias gratis</div>
            </div>
            <div class="plan" onclick="document.querySelectorAll('.plan').forEach(p => p.classList.remove('selected')); this.classList.add('selected'); document.getElementById('plan-input').value = 'starter';">
              <div class="plan-name">Starter</div>
              <div class="plan-price">R$ 199/mes</div>
            </div>
            <div class="plan" onclick="document.querySelectorAll('.plan').forEach(p => p.classList.remove('selected')); this.classList.add('selected'); document.getElementById('plan-input').value = 'pro';">
              <div class="plan-name">Pro</div>
              <div class="plan-price">R$ 499/mes</div>
            </div>
            <div class="plan" onclick="document.querySelectorAll('.plan').forEach(p => p.classList.remove('selected')); this.classList.add('selected'); document.getElementById('plan-input').value = 'enterprise';">
              <div class="plan-name">Enterprise</div>
              <div class="plan-price">Sob consulta</div>
            </div>
          </div>
          <input type="hidden" id="plan-input" name="plan" value="trial" />

          <button type="submit">Criar Conta</button>
        </form>

        <div class="login-link">
          Ja tem uma conta? <a href="/login">Entrar</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// POST /signup — create tenant.
signupRoutes.post("/signup", async (c) => {
  const enabled = await isSignupEnabled();
  if (!enabled) {
    return c.redirect("/login");
  }

  const body = await c.req.formData();
  const parsed = signupSchema.safeParse({
    firm_name: body.get("firm_name"),
    admin_name: body.get("admin_name"),
    admin_email: body.get("admin_email"),
    admin_password: body.get("admin_password"),
    plan: body.get("plan") ?? "trial",
    phone: body.get("phone") || undefined,
  });

  if (!parsed.success) {
    setFlash(c, "error", parsed.error.issues[0]?.message ?? "Dados invalidos");
    return c.redirect("/signup");
  }

  const result = await provisionTenant({
    firmName: parsed.data.firm_name,
    adminName: parsed.data.admin_name,
    adminEmail: parsed.data.admin_email,
    adminPassword: parsed.data.admin_password,
    plan: parsed.data.plan,
    phone: parsed.data.phone,
  });

  if (result.success) {
    setFlash(c, "success", "Conta criada com sucesso! Faca login para comecar.");
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
