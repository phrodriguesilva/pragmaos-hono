import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge, Modal } from "../components/ui";

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
