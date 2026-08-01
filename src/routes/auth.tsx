import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { setCookie, deleteCookie } from "hono/cookie";
import { AuthLayout } from "../layouts/base";
import { supabase } from "../lib/supabase";
import { APP_URL } from "../lib/env";

export const authRoutes = new Hono<AppEnv>();

// Login form with icons + password reveal toggle (Alpine.js).
function loginForm(errorMsg?: string, emailValue?: string) {
  return (
    <AuthLayout title="Entrar">
      <div class="flex items-center gap-2 mb-1">
        <i class="ph-bold ph-scales text-h2 text-navy-700" aria-hidden="true" />
        <h1 class="text-h2 font-bold text-gray-900">PragmaOS</h1>
      </div>
      <p class="text-body-sm text-gray-500 mb-6">Gestao juridica para escritorios.</p>
      {errorMsg ? <p class="text-body-sm text-status-red mb-4">{errorMsg}</p> : null}
      <form method="post" action="/login" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label for="email" class="text-body-sm font-semibold text-gray-700">
            Email<span class="text-status-red"> *</span>
          </label>
          <div class="relative">
            <i class="ph ph-envelope absolute left-2 top-1/2 -translate-y-1/2 text-body text-gray-400" aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              required
              value={emailValue}
              placeholder="voce@escritorio.com"
              class="input pl-7"
            />
          </div>
        </div>
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
              class="input pl-7 pr-7"
              {...{ ":type": "show ? 'text' : 'password'" }}
            />
            <button
              type="button"
              {...{ "@click": "show = !show" }}
              aria-label="Mostrar senha"
              class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 px-1"
            >
              <i {...{ ":class": "show ? 'ph ph-eye-slash' : 'ph ph-eye'" }} class="ph ph-eye text-body" aria-hidden="true" />
            </button>
          </div>
        </div>
        <button type="submit" class="btn btn-primary w-full flex items-center justify-center gap-2">
          <i class="ph ph-sign-in" aria-hidden="true" />
          Entrar
        </button>
      </form>
    </AuthLayout>
  );
}

// GET /login -- render the login form.
authRoutes.get("/login", (c) => c.html(loginForm()));

// POST /login -- authenticate via Supabase Auth, set the access token cookie.
authRoutes.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return c.html(loginForm("Email e senha sao obrigatorios.", email));
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return c.html(loginForm("Credenciais invalidas.", email));
  }

  // Set the access token as an HttpOnly cookie.
  setCookie(c, "sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "Strict",
    path: "/",
    maxAge: data.session.expires_in ?? 3600,
  });

  return c.redirect("/");
});

// POST /logout -- clear the session cookie and sign out.
authRoutes.post("/logout", async (c) => {
  deleteCookie(c, "sb-access-token", { path: "/" });
  return c.redirect("/login");
});

// GET /logout -- convenience redirect (topbar menu link).
authRoutes.get("/logout", (c) => c.redirect("/login"));
