import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const teamsRoutes = new Hono<AppEnv>();

teamsRoutes.use("*", requireAuth);

const teamSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  description: z.string().optional(),
  leader_id: z.string().optional(),
});

// GET /teams -- list teams.
teamsRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, description, leader_id")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Fetch leader names and member counts in parallel.
  const leaderIds = (teams ?? []).map((t) => t.leader_id).filter(Boolean) as string[];
  const teamIds = (teams ?? []).map((t) => t.id);

  const [leadersRes, membersRes] = await Promise.all([
    leaderIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", leaderIds)
      : Promise.resolve({ data: [], error: null }),
    teamIds.length
      ? supabase.from("team_members").select("team_id").in("team_id", teamIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const leaderMap = new Map((leadersRes.data ?? []).map((p) => [p.id, p.full_name]));
  const memberCountMap = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    memberCountMap.set(m.team_id, (memberCountMap.get(m.team_id) ?? 0) + 1);
  }

  const rows = (teams ?? []).map((t) => [
    <a href={`/teams/${t.id}`} class="text-terracota-600 hover:underline">{t.name}</a> as unknown as string,
    t.leader_id ? (leaderMap.get(t.leader_id) ?? "-") : "-",
    String(memberCountMap.get(t.id) ?? 0),
    t.description ?? "-",
  ]);

  return renderPage(
    c,
    { title: "Equipes", active: "teams" },
    <>
      <PageHeader
        title="Equipes"
        icon="ph-users-four"
        actions={() => (
          <a href="/teams/new" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-plus" aria-hidden="true"></i>Nova Equipe
          </a>
        )}
      />
      <Table
        columns={[
          { label: "Nome" },
          { label: "Lider" },
          { label: "Membros", align: "center" },
          { label: "Descricao" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma equipe encontrada."
        emptyIcon="ph-users-four"
        ariaLabel="Lista de equipes"
      />
    </>,
  );
});

// GET /teams/new -- render the create form.
teamsRoutes.get("/new", async (c) => {
  const user = c.get("user");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name");

  return renderPage(
    c,
    { title: "Nova Equipe", active: "teams" },
    <>
      <PageHeader title="Nova Equipe" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/teams" class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required placeholder="Nome da equipe" />
          <Textarea label="Descricao" id="description" name="description" rows={3} />
          <Select
            label="Lider"
            id="leader_id"
            name="leader_id"
            icon="ph-user-circle"
            options={[
              { value: "", label: "Sem lider" },
              ...((profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))),
            ]}
          />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/teams" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /teams -- create.
teamsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = teamSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return renderPage(
      c,
      { title: "Nova Equipe", active: "teams" },
      <>
        <PageHeader title="Nova Equipe" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red">
            <i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>
            {Object.values(errors).flat().join(", ")}
          </div>
          <a href="/teams/new" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar</a>
        </Panel>
      </>,
    );
  }

  const { error } = await supabase.from("teams").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    leader_id: parsed.data.leader_id || null,
  });

  if (error) {
    return renderPage(
      c,
      { title: "Nova Equipe", active: "teams" },
      <>
        <PageHeader title="Nova Equipe" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Erro ao salvar: {error.message}</div>
          <a href="/teams/new" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar</a>
        </Panel>
      </>,
    );
  }

  return c.redirect("/teams");
});

// GET /teams/:id -- detail: team info, leader name, members table with add form.
teamsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!team) {
    return c.html("Equipe nao encontrada.", 404);
  }

  // Fetch leader profile.
  let leaderName = "-";
  if (team.leader_id) {
    const { data: leader } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", team.leader_id)
      .single();
    leaderName = leader?.full_name ?? "-";
  }

  // Fetch members with profile info.
  const { data: members } = await supabase
    .from("team_members")
    .select("id, user_id, profiles!inner(full_name, email, role)")
    .eq("team_id", id)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  // Fetch all profiles for the add-member dropdown.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name");

  const memberUserIds = new Set((members ?? []).map((m) => m.user_id));
  const availableProfiles = (profiles ?? []).filter((p) => !memberUserIds.has(p.id));

  return renderPage(
    c,
    { title: team.name, active: "teams" },
    <>
      <PageHeader
        title={team.name}
        icon="ph-users-four"
        actions={() => (
          <a href={`/teams/${id}/edit`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-pencil" aria-hidden="true"></i>Editar</a>
        )}
      />
      <div class="mb-6">
        <Panel title="Dados da equipe" icon="ph-users-three">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Lider: </dt><dd class="inline">{leaderName}</dd></div>
            {team.description ? <div><dt class="font-semibold text-gray-700 inline">Descricao: </dt><dd class="inline">{team.description}</dd></div> : null}
          </dl>
        </Panel>
      </div>
      <Panel title="Membros" icon="ph-users">
        <div class="mb-4">
          <form method="post" action={`/teams/${id}/members`} class="flex gap-2 items-end">
            <Select
              label="Adicionar Membro"
              id="user_id"
              name="user_id"
              icon="ph-user-plus"
              options={[
                { value: "", label: "Selecione um usuario..." },
                ...(availableProfiles.map((p) => ({ value: p.id, label: p.full_name }))),
              ]}
              required
            />
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Adicionar</button>
          </form>
        </div>
        <Table
          columns={[
            { label: "Nome" },
            { label: "Email" },
            { label: "Papel" },
            { label: "Acoes", align: "center" },
          ]}
          rows={(members ?? []).map((m) => {
            const profile = m.profiles as unknown as { full_name: string; email: string; role: string };
            return [
              profile.full_name,
              profile.email ?? "-",
              <Badge color="blue">{profile.role}</Badge> as unknown as string,
              <form method="post" action={`/teams/${id}/members/${m.id}/remove`}>
                <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Remover este membro?')">
                  <i class="ph ph-user-minus" aria-hidden="true"></i>Remover
                </button>
              </form> as unknown as string,
            ];
          })}
          emptyMsg="Nenhum membro na equipe."
          emptyIcon="ph-users"
          ariaLabel="Lista de membros"
        />
      </Panel>
    </>,
  );
});

// GET /teams/:id/edit -- edit form.
teamsRoutes.get("/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!team) {
    return c.html("Equipe nao encontrada.", 404);
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("full_name");

  return renderPage(
    c,
    { title: `Editar ${team.name}`, active: "teams" },
    <>
      <PageHeader title={`Editar ${team.name}`} icon="ph-pencil" />
      <Panel>
        <form method="post" action={`/teams/${id}`} class="flex flex-col gap-4">
          <TextField label="Nome" id="name" name="name" required value={team.name} />
          <Textarea label="Descricao" id="description" name="description" rows={3}>
            {team.description ?? ""}
          </Textarea>
          <Select
            label="Lider"
            id="leader_id"
            name="leader_id"
            icon="ph-user-circle"
            selected={team.leader_id ?? ""}
            options={[
              { value: "", label: "Sem lider" },
              ...((profiles ?? []).map((p) => ({ value: p.id, label: p.full_name }))),
            ]}
          />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/teams/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /teams/:id -- update.
teamsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = teamSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/teams/${id}/edit`);
  }

  await supabase
    .from("teams")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      leader_id: parsed.data.leader_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/teams/${id}`);
});

// POST /teams/:id/delete -- soft delete.
teamsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("teams")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/teams");
});

// POST /teams/:id/members -- add member.
teamsRoutes.post("/:id/members", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const userId = (body["user_id"] as string)?.trim();

  if (!userId) {
    return c.redirect(`/teams/${id}`);
  }

  await supabase.from("team_members").insert({
    tenant_id: user.tenantId,
    team_id: id,
    user_id: userId,
  });

  return c.redirect(`/teams/${id}`);
});

// POST /teams/:id/members/:memberId/remove -- remove member.
teamsRoutes.post("/:id/members/:memberId/remove", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const memberId = c.req.param("memberId");

  await supabase
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("team_id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/teams/${id}`);
});
