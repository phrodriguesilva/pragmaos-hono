import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge, BtnLink, Modal } from "../components/ui";

export const usersRoutes = new Hono<AppEnv>();

usersRoutes.use("*", requireAuth);
// Only socio can manage users.
usersRoutes.use("*", requireRole("socio"));

const userSchema = z.object({
  email: z.string().email("Email invalido"),
  full_name: z.string().min(1, "Nome e obrigatorio"),
  role: z.enum(["socio", "advogado", "estagiario", "financeiro", "recepcao"]),
});

const userUpdateSchema = z.object({
  full_name: z.string().min(1, "Nome e obrigatorio"),
  role: z.enum(["socio", "advogado", "estagiario", "financeiro", "recepcao"]),
  active: z.enum(["true", "false"]).optional(),
});

usersRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, active, created_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name");

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: users, count } = await query;

  const rows = (users ?? []).map((u) => [
    <a href={`/users/${u.id}`} class="text-terracota-600 hover:underline">{u.full_name}</a> as unknown as string,
    u.email,
    <Badge color="blue">{u.role}</Badge> as unknown as string,
    u.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/users/${u.id}`} class="text-terracota-600 hover:underline text-body-sm">Ver</a>
      <a href={`/users/${u.id}`} class="text-terracota-600 hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/users/${u.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Usuarios", active: "users" },
    <>
      <PageHeader title="Usuarios" icon="ph-user-circle-gear" actions={() => (
        <Modal
          id="newUser"
          title="Novo Usuario"
          icon="ph-user-plus"
          triggerText="Novo Usuario"
          triggerIcon="ph-plus"
          action="/users"
          submitLabel="Criar e Convidar"
          submitIcon="ph-paper-plane-tilt"
        >
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
        </Modal>
      )} />
      <form method="get" action="/users" class="mb-4 flex gap-4 items-end">
        <TextField
          label="Buscar"
          id="search"
          name="search"
          type="text"
          value={search}
          placeholder="Nome ou email..."
          icon="ph-magnifying-glass"
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "Nome" }, { label: "Email" }, { label: "Papel" }, { label: "Status" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhum usuario."
        emptyIcon="ph-users"
        ariaLabel="Lista de usuarios"
      />
      <div class="mt-2 text-body-sm text-gray-500">{count ?? 0} usuario(s)</div>
    </>,
  );
});

usersRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/users");

  // Invite the user via Supabase Auth (sends an email with a password setup link).
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: "/login",
  });
  if (error || !data.user) {
    return c.redirect("/users");
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

// GET /users/:id -- detail.
usersRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!profile) {
    return c.html("Usuario nao encontrado.", 404);
  }

  return renderPage(
    c,
    { title: profile.full_name, active: "users" },
    <>
      <PageHeader
        title={profile.full_name}
        icon="ph-user-circle"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="editUser"
              title="Editar Usuario"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/users/${profile.id}`}
              submitLabel="Salvar Alteracoes"
              large
            >
              <TextField label="Nome" id="full_name" name="full_name" required value={profile.full_name} />
              <Select
                label="Papel"
                id="role"
                name="role"
                required
                options={[
                  { value: "socio", label: "Socio" },
                  { value: "advogado", label: "Advogado" },
                  { value: "estagiario", label: "Estagiario" },
                  { value: "financeiro", label: "Financeiro" },
                  { value: "recepcao", label: "Recepcao" },
                ]}
                selected={profile.role}
              />
              <Select
                label="Status"
                id="active"
                name="active"
                options={[
                  { value: "true", label: "Ativo" },
                  { value: "false", label: "Inativo" },
                ]}
                selected={profile.active ? "true" : "false"}
              />
            </Modal>
            <form method="post" action={`/users/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este usuario?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados do usuario" icon="ph-user-circle">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Nome: </dt><dd class="inline">{profile.full_name}</dd></div>
            {profile.email ? <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{profile.email}</dd></div> : null}
            <div><dt class="font-semibold text-gray-700 inline">Papel: </dt><dd class="inline">{profile.role}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">{profile.active ? "Ativo" : "Inativo"}</dd></div>
          </dl>
        </Panel>
      </div>
    </>,
  );
});

// POST /users/:id -- update.
usersRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = userUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/users/${id}`);
  }

  await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      active: parsed.data.active === "true",
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/users/${id}`);
});

// POST /users/:id/delete -- soft delete.
usersRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/users");
});
