import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, TextField, Badge } from "../components/ui";
import { generateTOTPSecret, validateTOTP, generateQRCodeDataURL, generateBackupCodes, buildTOTPUri } from "../lib/totp";

export const profileRoutes = new Hono<AppEnv>();

profileRoutes.use("*", requireAuth);

// GET /profile -- show current user's profile with security/2FA section.
profileRoutes.get("/", async (c) => {
  const user = c.get("user");
  const twofaParam = c.req.query("2fa");

  const [profileRes, totpRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, role, active, created_at, tenants(name)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_totp")
      .select("enabled, created_at, updated_at")
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!profileRes.data) return c.html("Perfil nao encontrado.", 404);

  const profile = profileRes.data;
  const tenant = profile.tenants as unknown as { name: string } | null;
  const totp = totpRes.data;
  const twoFAEnabled = totp?.enabled ?? false;

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

      {twofaParam === "already" ? (
        <div class="mb-4 border border-status-yellow bg-status-yellow-bg text-status-yellow text-body-sm px-3 py-2 flex items-center gap-2">
          <i class="ph ph-info" aria-hidden="true" />
          2FA ja esta ativado para sua conta.
        </div>
      ) : null}
      {twofaParam === "disabled" ? (
        <div class="mb-4 border border-status-red bg-status-red-bg text-status-red text-body-sm px-3 py-2 flex items-center gap-2">
          <i class="ph ph-shield-slash" aria-hidden="true" />
          2FA foi desativado.
        </div>
      ) : null}
      {twofaParam === "enabled" ? (
        <div class="mb-4 border border-status-green bg-status-green-bg text-status-green text-body-sm px-3 py-2 flex items-center gap-2">
          <i class="ph ph-shield-check" aria-hidden="true" />
          2FA ativado com sucesso!
        </div>
      ) : null}

      <div class="grid grid-cols-2 gap-4 mb-4">
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

      {/* Security / 2FA Section */}
      <Panel title="Seguranca e 2FA" icon="ph-shield-check">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <i class="ph ph-shield-check text-h3 text-navy-700" aria-hidden="true" />
              <h3 class="text-body font-semibold text-gray-800">Autenticacao em dois fatores (2FA)</h3>
              {twoFAEnabled ? (
                <Badge color="green" icon="ph-check-circle">Ativo</Badge>
              ) : (
                <Badge color="gray" icon="ph-x-circle">Desativado</Badge>
              )}
            </div>
            <p class="text-body-sm text-gray-600 mb-3">
              {twoFAEnabled
                ? "Sua conta esta protegida com 2FA. A cada login, voce precisara informar um codigo do seu app autenticador."
                : "Adicione uma camada extra de seguranca. Ao ativar 2FA, voce precisara de um codigo do seu app autenticador (Google Authenticator, Authy, etc) alem da senha."}
            </p>
            {twoFAEnabled ? (
              <div class="flex gap-2">
                <form method="post" action="/profile/2fa/disable" onsubmit="return confirm('Tem certeza que deseja desativar 2FA? Sua conta ficara menos segura.')">
                  <button type="submit" class="btn btn-danger inline-flex items-center gap-1">
                    <i class="ph ph-shield-slash" aria-hidden="true" />Desativar 2FA
                  </button>
                </form>
                <a href="/2fa/setup" class="btn btn-secondary inline-flex items-center gap-1">
                  <i class="ph ph-arrows-clockwise" aria-hidden="true" />Reconfigurar
                </a>
              </div>
            ) : (
              <a href="/2fa/setup" class="btn btn-primary inline-flex items-center gap-1">
                <i class="ph ph-shield-star" aria-hidden="true" />Ativar 2FA
              </a>
            )}
          </div>
        </div>

        {twoFAEnabled && totp?.updated_at ? (
          <div class="mt-4 pt-4 border-t border-border">
            <p class="text-body-sm text-gray-500 flex items-center gap-1">
              <i class="ph ph-clock" aria-hidden="true" />
              2FA ativado em: {new Date(totp.updated_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        ) : null}
      </Panel>
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

// POST /profile/2fa/disable -- disable 2FA for the current user.
profileRoutes.post("/2fa/disable", async (c) => {
  const user = c.get("user");

  // Verify current 2FA status.
  const { data: totpRow } = await supabase
    .from("user_totp")
    .select("id, enabled, tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!totpRow || !totpRow.enabled) {
    return c.redirect("/profile");
  }

  // Disable 2FA and clear the secret.
  await supabase.from("user_totp").update({
    enabled: false,
    secret: "",
    backup_codes: [],
  }).eq("user_id", user.id);

  // Log the disable event.
  await supabase.from("auth_logs").insert({
    tenant_id: totpRow.tenant_id,
    user_id: user.id,
    event_type: "2fa_disabled",
    ip_address: c.req.header("x-forwarded-for") ?? null,
    user_agent: c.req.header("user-agent") ?? null,
    success: true,
  });

  return c.redirect("/profile?2fa=disabled");
});
