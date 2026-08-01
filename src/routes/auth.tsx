import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { setCookie, deleteCookie } from "hono/cookie";
import { AuthLayout } from "../layouts/base";
import { TextField } from "../components/ui";
import { supabase } from "../lib/supabase";
import { APP_URL } from "../lib/env";

export const authRoutes = new Hono<AppEnv>();

// GET /login -- render the login form.
authRoutes.get("/login", (c) => {
  return c.html(
    <AuthLayout title="Entrar">
      <h1 class="text-h2 font-bold text-gray-900 mb-1">PragmaOS</h1>
      <p class="text-body-sm text-gray-500 mb-6">Gestao juridica para escritorios.</p>
      <form method="post" action="/login" class="flex flex-col gap-4">
        <TextField label="Email" id="email" name="email" type="email" required placeholder="voce@escritorio.com" />
        <TextField label="Senha" id="password" name="password" type="password" required placeholder="********" />
        <button type="submit" class="btn btn-primary w-full">
          Entrar
        </button>
      </form>
    </AuthLayout>,
  );
});

// POST /login -- authenticate via Supabase Auth, set the access token cookie.
authRoutes.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return c.html(
      <AuthLayout title="Entrar">
        <h1 class="text-h2 font-bold text-gray-900 mb-1">PragmaOS</h1>
        <p class="text-body-sm text-status-red mb-4">Email e senha sao obrigatorios.</p>
        <form method="post" action="/login" class="flex flex-col gap-4">
          <TextField label="Email" id="email" name="email" type="email" required value={email} />
          <TextField label="Senha" id="password" name="password" type="password" required />
          <button type="submit" class="btn btn-primary w-full">Entrar</button>
        </form>
      </AuthLayout>,
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return c.html(
      <AuthLayout title="Entrar">
        <h1 class="text-h2 font-bold text-gray-900 mb-1">PragmaOS</h1>
        <p class="text-body-sm text-status-red mb-4">Credenciais invalidas.</p>
        <form method="post" action="/login" class="flex flex-col gap-4">
          <TextField label="Email" id="email" name="email" type="email" required value={email} />
          <TextField label="Senha" id="password" name="password" type="password" required />
          <button type="submit" class="btn btn-primary w-full">Entrar</button>
        </form>
      </AuthLayout>,
    );
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
