import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, TextField, Badge } from "../components/ui";

export const profileRoutes = new Hono<AppEnv>();

profileRoutes.use("*", requireAuth);

// GET /profile -- show current user's profile.
profileRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active, created_at, tenants(name)")
    .eq("id", user.id)
    .single();

  if (!profile) return c.html("Perfil nao encontrado.", 404);

  const tenant = profile.tenants as unknown as { name: string } | null;
  const roleLabels: Record<string, string> = {
    socio: "Socio",
    advogado: "Advogado",
    estagiario: "Estagiario",
    financeiro: "Financeiro",
    recepcao: "Recepcao",
    admin: "Administrador",
  };

  return renderPage(
    c,
    { title: "Meu Perfil", active: "profile" },
    <>
      <PageHeader title="Meu Perfil" icon="ph-user" />

      <div class="grid grid-cols-2 gap-4">
        <Panel title="Dados pessoais" icon="ph-user">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Nome: </dt><dd class="inline">{profile.full_name}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{profile.email}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Papel: </dt><dd class="inline"><Badge color="blue">{roleLabels[profile.role] ?? profile.role}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">{profile.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Escritorio: </dt><dd class="inline">{tenant?.name ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cadastro: </dt><dd class="inline">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</dd></div>
          </dl>
        </Panel>

        <Panel title="Alterar senha" icon="ph-key">
          <form method="post" action="/profile/password" class="flex flex-col gap-3">
            <TextField label="Senha atual" id="current_password" name="current_password" type="password" required icon="ph-lock" />
            <TextField label="Nova senha" id="new_password" name="new_password" type="password" required icon="ph-lock" placeholder="Minimo 6 caracteres" />
            <TextField label="Confirmar nova senha" id="confirm_password" name="confirm_password" type="password" required icon="ph-lock" />
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1 self-start">
              <i class="ph ph-floppy-disk" aria-hidden="true" />Alterar senha
            </button>
          </form>
        </Panel>
      </div>
    </>,
  );
});

// POST /profile/password -- change password via Supabase Auth.
profileRoutes.post("/password", async (c) => {
  const body = await c.req.parseBody();
  const currentPassword = String(body.current_password ?? "");
  const newPassword = String(body.new_password ?? "");
  const confirmPassword = String(body.confirm_password ?? "");

  const user = c.get("user");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return renderPage(
      c,
      { title: "Meu Perfil", active: "profile" },
      <>
        <PageHeader title="Meu Perfil" icon="ph-user" />
        <Panel>
          <div class="mb-4 text-status-red flex items-center gap-2">
            <i class="ph ph-warning text-h2" aria-hidden="true" />
            Todos os campos sao obrigatorios.
          </div>
          <a href="/profile" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
          </a>
        </Panel>
      </>,
    );
  }

  if (newPassword !== confirmPassword) {
    return renderPage(
      c,
      { title: "Meu Perfil", active: "profile" },
      <>
        <PageHeader title="Meu Perfil" icon="ph-user" />
        <Panel>
          <div class="mb-4 text-status-red flex items-center gap-2">
            <i class="ph ph-warning text-h2" aria-hidden="true" />
            A nova senha e a confirmacao nao coincidem.
          </div>
          <a href="/profile" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
          </a>
        </Panel>
      </>,
    );
  }

  if (newPassword.length < 6) {
    return renderPage(
      c,
      { title: "Meu Perfil", active: "profile" },
      <>
        <PageHeader title="Meu Perfil" icon="ph-user" />
        <Panel>
          <div class="mb-4 text-status-red flex items-center gap-2">
            <i class="ph ph-warning text-h2" aria-hidden="true" />
            A nova senha deve ter no minimo 6 caracteres.
          </div>
          <a href="/profile" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
          </a>
        </Panel>
      </>,
    );
  }

  // Update password via Supabase Auth.
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    return renderPage(
      c,
      { title: "Meu Perfil", active: "profile" },
      <>
        <PageHeader title="Meu Perfil" icon="ph-user" />
        <Panel>
          <div class="mb-4 text-status-red flex items-center gap-2">
            <i class="ph ph-warning text-h2" aria-hidden="true" />
            Erro ao alterar senha: {error.message}
          </div>
          <a href="/profile" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
          </a>
        </Panel>
      </>,
    );
  }

  return renderPage(
    c,
    { title: "Meu Perfil", active: "profile" },
    <>
      <PageHeader title="Meu Perfil" icon="ph-user" />
      <Panel>
        <div class="mb-4 text-status-green flex items-center gap-2">
          <i class="ph ph-check-circle text-h2" aria-hidden="true" />
          Senha alterada com sucesso!
        </div>
        <a href="/profile" class="btn btn-secondary inline-flex items-center gap-1">
          <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
        </a>
      </Panel>
    </>,
  );
});
