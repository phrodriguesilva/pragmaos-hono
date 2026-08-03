import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge, Modal, Textarea } from "../components/ui";

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
  phone: z.string().optional(),
  oab_number: z.string().optional(),
  oab_state: z.string().optional(),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  photo_url: z.string().optional(),
  admission_date: z.string().optional(),
  bar_admission_date: z.string().optional(),
  specialties: z.string().optional(),
});

const roleLabels: Record<string, string> = {
  socio: "Socio",
  advogado: "Advogado",
  estagiario: "Estagiario",
  financeiro: "Financeiro",
  recepcao: "Recepcao",
};

const roleOptions = [
  { value: "socio", label: "Socio" },
  { value: "advogado", label: "Advogado" },
  { value: "estagiario", label: "Estagiario" },
  { value: "financeiro", label: "Financeiro" },
  { value: "recepcao", label: "Recepcao" },
];

const ufOptions = [
  "", "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
].map((uf) => ({ value: uf, label: uf || "—" }));

usersRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";
  const roleFilter = c.req.query("role")?.trim() ?? "";
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, active, photo_url, oab_number, oab_state, created_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name")
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (roleFilter) {
    query = query.eq("role", roleFilter);
  }

  const { data: users, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / limit);

  const rows = (users ?? []).map((u) => [
    <div class="flex items-center gap-2">
      {u.photo_url ? (
        <img src={u.photo_url} alt={u.full_name} class="h-8 w-8 rounded-full object-cover" />
      ) : (
        <div class="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-body-sm font-semibold">
          {u.full_name?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
      )}
      <a href={`/users/${u.id}`} class="text-[#0568ff] hover:underline">{u.full_name}</a>
    </div> as unknown as string,
    u.email,
    <Badge color="blue">{roleLabels[u.role] ?? u.role}</Badge> as unknown as string,
    u.oab_number ? `OAB/${u.oab_state ?? ""} ${u.oab_number}` : "—" as unknown as string,
    u.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge> as unknown as string,
    <div class="flex items-center gap-2">
      <a href={`/users/${u.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/users/${u.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/users/${u.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Equipe", active: "users" },
    <>
      <PageHeader title="Equipe" icon="ph-user-circle-gear" actions={() => (
        <Modal
          id="newUser"
          title="Novo Profissional"
          icon="ph-user-plus"
          triggerText="Novo Profissional"
          triggerIcon="ph-plus"
          action="/users"
          submitLabel="Criar e Convidar"
          submitIcon="ph-paper-plane-tilt"
        >
          <TextField label="Nome completo" id="full_name" name="full_name" required />
          <TextField label="Email" id="email" name="email" type="email" required />
          <Select label="Papel" id="role" name="role" required options={roleOptions} />
        </Modal>
      )} />
      <form method="get" action="/users" class="mb-4 flex gap-4 items-end flex-wrap">
        <TextField
          label="Buscar"
          id="search"
          name="search"
          type="text"
          value={search}
          placeholder="Nome ou email..."
          icon="ph-magnifying-glass"
        />
        <Select
          label="Papel"
          id="role"
          name="role"
          options={[{ value: "", label: "Todos" }, ...roleOptions]}
          selected={roleFilter}
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "Nome" }, { label: "Email" }, { label: "Papel" }, { label: "OAB" }, { label: "Status" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg={search || roleFilter ? "Nenhum profissional encontrado com esses filtros." : "Nenhum profissional cadastrado."}
        emptyIcon="ph-users"
        ariaLabel="Lista de profissionais"
        count={count ?? 0}
        countLabel="profissional(is)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/users",
          queryParams: { search, role: roleFilter },
        }}
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
  const { error: profileError } = await supabase.from("profiles").insert({
    id: data.user.id,
    tenant_id: user.tenantId,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
  });

  if (profileError) {
    // Compensating action: delete the created auth user to avoid an orphan.
    console.error("[USERS] Profile insert failed, rolling back auth user:", profileError.message);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(data.user.id);
    if (deleteError) {
      console.error(`[USERS] CRITICAL: Failed to delete orphaned auth user ${data.user.id} — manual cleanup required:`, deleteError.message);
    }
    return c.redirect("/users");
  }

  const { error: auditError } = await supabase.from("audit_log").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    action: "create",
    entity_type: "user",
    entity_id: data.user.id,
    details: { email: parsed.data.email, full_name: parsed.data.full_name, role: parsed.data.role },
  });

  if (auditError) {
    // Compensating action: delete the profile and auth user to avoid orphans.
    console.error("[USERS] Audit log insert failed, rolling back profile and auth user:", auditError.message);
    const { error: profileDeleteError } = await supabase.from("profiles").delete().eq("id", data.user.id);
    if (profileDeleteError) {
      console.error(`[USERS] CRITICAL: Failed to delete profile for orphaned auth user ${data.user.id} — manual cleanup required:`, profileDeleteError.message);
    }
    const { error: deleteError } = await supabase.auth.admin.deleteUser(data.user.id);
    if (deleteError) {
      console.error(`[USERS] CRITICAL: Failed to delete orphaned auth user ${data.user.id} — manual cleanup required:`, deleteError.message);
    }
    return c.redirect("/users");
  }

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
    return c.html("Profissional nao encontrado.", 404);
  }

  // Format date for display
  const fmtDate = (d: string | null | undefined) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return d; }
  };

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
              title="Editar Profissional"
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/users/${profile.id}`}
              submitLabel="Salvar Alteracoes"
              large
            >
              <TextField label="Nome completo" id="full_name" name="full_name" required value={profile.full_name} />
              <Select label="Papel" id="role" name="role" required options={roleOptions} selected={profile.role} />
              <Select
                label="Status"
                id="active"
                name="active"
                options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Inativo" }]}
                selected={profile.active ? "true" : "false"}
              />
              <TextField label="Telefone" id="phone" name="phone" value={profile.phone ?? ""} placeholder="(11) 99999-9999" />
              <div class="grid grid-cols-2 gap-3">
                <TextField label="OAB Numero" id="oab_number" name="oab_number" value={profile.oab_number ?? ""} placeholder="123456" />
                <Select label="OAB UF" id="oab_state" name="oab_state" options={ufOptions} selected={profile.oab_state ?? ""} />
              </div>
              <TextField label="Foto (URL)" id="photo_url" name="photo_url" value={profile.photo_url ?? ""} placeholder="https://..." />
              <TextField label="LinkedIn" id="linkedin_url" name="linkedin_url" value={profile.linkedin_url ?? ""} placeholder="https://linkedin.com/in/..." />
              <div class="grid grid-cols-2 gap-3">
                <TextField label="Data de Admissao" id="admission_date" name="admission_date" type="date" value={profile.admission_date ?? ""} />
                <TextField label="Inscricao na OAB" id="bar_admission_date" name="bar_admission_date" type="date" value={profile.bar_admission_date ?? ""} />
              </div>
              <TextField label="Especialidades (separadas por virgula)" id="specialties" name="specialties" value={(profile.specialties ?? []).join(", ")} placeholder="Civel, Trabalhista, Tributario" />
              <Textarea label="Biografia" id="bio" name="bio" placeholder="Breve biografia profissional..." value={profile.bio ?? ""} />
            </Modal>
            <form method="post" action={`/users/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este profissional?')" aria-label="Excluir">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Photo + basic info */}
        <Panel title="Perfil" icon="ph-user-circle">
          <div class="flex flex-col items-center gap-3">
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={profile.full_name} class="h-32 w-32 rounded-full object-cover border-4 border-gray-100" />
            ) : (
              <div class="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-h1 font-semibold">
                {profile.full_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <div class="text-center">
              <h3 class="font-semibold text-gray-800">{profile.full_name}</h3>
              <p class="text-body-sm text-gray-500">{roleLabels[profile.role] ?? profile.role}</p>
              <div class="mt-2 flex justify-center">
                {profile.active ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>}
              </div>
            </div>
          </div>
        </Panel>

        {/* Contact + professional data */}
        <Panel title="Dados Profissionais" icon="ph-identification-card">
          <dl class="flex flex-col gap-2 text-body-sm">
            {profile.email && (
              <div><dt class="font-semibold text-gray-700 inline">Email: </dt><dd class="inline">{profile.email}</dd></div>
            )}
            {profile.phone && (
              <div><dt class="font-semibold text-gray-700 inline">Telefone: </dt><dd class="inline">{profile.phone}</dd></div>
            )}
            {profile.oab_number && (
              <div><dt class="font-semibold text-gray-700 inline">OAB: </dt><dd class="inline">OAB/{profile.oab_state ?? ""} {profile.oab_number}</dd></div>
            )}
            {fmtDate(profile.bar_admission_date) && (
              <div><dt class="font-semibold text-gray-700 inline">Inscricao OAB: </dt><dd class="inline">{fmtDate(profile.bar_admission_date)}</dd></div>
            )}
            {fmtDate(profile.admission_date) && (
              <div><dt class="font-semibold text-gray-700 inline">Admissao: </dt><dd class="inline">{fmtDate(profile.admission_date)}</dd></div>
            )}
            {profile.linkedin_url && (
              <div><dt class="font-semibold text-gray-700 inline">LinkedIn: </dt><dd class="inline"><a href={profile.linkedin_url} target="_blank" rel="noopener" class="text-[#0568ff] hover:underline">Ver perfil</a></dd></div>
            )}
          </dl>
        </Panel>

        {/* Specialties */}
        <Panel title="Especialidades" icon="ph-target">
          {profile.specialties && profile.specialties.length > 0 ? (
            <div class="flex flex-wrap gap-2">
              {profile.specialties.map((s: string) => (
                <Badge color="blue">{s}</Badge>
              ))}
            </div>
          ) : (
            <p class="text-body-sm text-gray-400">Nenhuma especialidade cadastrada.</p>
          )}
          {profile.bio && (
            <div class="mt-4 pt-4 border-t border-gray-100">
              <h4 class="text-body-sm font-semibold text-gray-700 mb-1">Biografia</h4>
              <p class="text-body-sm text-gray-600 whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}
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

  // Prevent removing role from the last socio (would lock admin access)
  if (parsed.data.role !== "socio") {
    const { data: target } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", id)
      .eq("tenant_id", user.tenantId)
      .single();

    if (target?.role === "socio") {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user.tenantId)
        .eq("role", "socio")
        .is("deleted_at", null);

      if ((count ?? 0) <= 1) {
        return c.html("Nao e possivel alterar o papel do unico socio do escritorio.", 400);
      }
    }
  }

  // Parse specialties from comma-separated string to array
  const specialties = parsed.data.specialties
    ? parsed.data.specialties.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      role: parsed.data.role,
      active: parsed.data.active === "true",
      phone: parsed.data.phone || null,
      oab_number: parsed.data.oab_number || null,
      oab_state: parsed.data.oab_state || null,
      bio: parsed.data.bio || null,
      linkedin_url: parsed.data.linkedin_url || null,
      photo_url: parsed.data.photo_url || null,
      admission_date: parsed.data.admission_date || null,
      bar_admission_date: parsed.data.bar_admission_date || null,
      specialties,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  await supabase.from("audit_log").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    action: "update",
    entity_type: "user",
    entity_id: id,
    details: { full_name: parsed.data.full_name, role: parsed.data.role, active: parsed.data.active === "true" },
  });

  // If user was deactivated, invalidate their sessions
  if (parsed.data.active === "false") {
    await supabase.auth.admin.signOut(id, "global").catch(() => {});
  }

  return c.redirect(`/users/${id}`);
});

// POST /users/:id/delete -- soft delete.
usersRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Prevent self-deletion
  if (id === user.id) {
    return c.html("Voce nao pode excluir sua propria conta.", 400);
  }

  // Prevent deleting the last socio (would lock admin access)
  if (user.role === "socio") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", user.tenantId)
      .eq("role", "socio")
      .is("deleted_at", null);

    if ((count ?? 0) <= 1) {
      return c.html("Nao e possivel excluir o unico socio do escritorio.", 400);
    }
  }

  await supabase
    .from("profiles")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  await supabase.from("audit_log").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    action: "delete",
    entity_type: "user",
    entity_id: id,
    details: {},
  });

  // Invalidate the deleted user's sessions
  await supabase.auth.admin.signOut(id, "global").catch(() => {});

  return c.redirect("/users");
});
