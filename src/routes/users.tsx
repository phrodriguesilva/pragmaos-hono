import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge } from "../components/ui";

export const usersRoutes = new Hono<AppEnv>();

usersRoutes.use("*", requireAuth);
// Only socio can manage users.
usersRoutes.use("*", requireRole("socio"));

const userSchema = z.object({
  email: z.string().email("Email invalido"),
  full_name: z.string().min(1, "Nome e obrigatorio"),
  role: z.enum(["socio", "advogado", "estagiario", "financeiro", "recepcao"]),
});

usersRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, active, created_at")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name");

  const rows = (users ?? []).map((u) => [
    u.full_name,
    u.email,
    <Badge color="blue">{u.role}</Badge> as unknown as string,
    u.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Usuarios", active: "users" },
    <>
      <PageHeader title="Usuarios" icon="ph-user-circle-gear" actions={() => <a href="/users/new" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Novo Usuario</a>} />
      <Table
        columns={[{ label: "Nome" }, { label: "Email" }, { label: "Papel" }, { label: "Status" }]}
        rows={rows}
        emptyMsg="Nenhum usuario."
        emptyIcon="ph-users"
        ariaLabel="Lista de usuarios"
      />
    </>,
  );
});

usersRoutes.get("/new", (c) => {
  return renderPage(
    c,
    { title: "Novo Usuario", active: "users" },
    <>
      <PageHeader title="Novo Usuario" icon="ph-user-plus" />
      <Panel>
        <form method="post" action="/users" class="flex flex-col gap-4">
          <TextField label="Nome" id="full_name" name="full_name" required />
          <TextField label="Email" id="email" name="email" type="email" required />
          <Select label="Papel" id="role" name="role" required
            options={[
              { value: "socio", label: "Socio" },
              { value: "advogado", label: "Advogado" },
              { value: "estagiario", label: "Estagiario" },
              { value: "financeiro", label: "Financeiro" },
              { value: "recepcao", label: "Recepcao" },
            ]}
          />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Criar e Convidar</button>
            <a href="/users" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

usersRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/users/new");

  // Invite the user via Supabase Auth (sends an email with a password setup link).
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: "/login",
  });
  if (error || !data.user) {
    return renderPage(
      c,
      { title: "Novo Usuario", active: "users" },
      <>
        <PageHeader title="Novo Usuario" icon="ph-user-plus" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Erro ao convidar: {error?.message ?? "erro desconhecido"}</div>
          <a href="/users/new" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar</a>
        </Panel>
      </>,
    );
  }

  // Create the profile row with the tenant_id and role.
  await supabase.from("profiles").insert({
    id: data.user.id,
    tenant_id: user.tenantId,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
  });

  return c.redirect("/users");
});
