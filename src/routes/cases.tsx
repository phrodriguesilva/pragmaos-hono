import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { generateCaseSummary, suggestNextSteps } from "../lib/ai";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const casesRoutes = new Hono<AppEnv>();

casesRoutes.use("*", requireAuth);

const caseSchema = z.object({
  client_id: z.string().uuid("Cliente invalido"),
  title: z.string().min(1, "Titulo e obrigatorio"),
  case_number: z.string().optional(),
  case_type: z.string().min(1),
  tribunal: z.string().optional(),
  status: z.enum(["active", "suspended", "archived"]),
  description: z.string().optional(),
});

const CASE_TYPES = [
  "Civel", "Trabalhista", "Penal", "Tributario", "Empresarial",
  "Familia", "Consumidor", "Administrativo", "Outro",
];

// GET /cases -- list.
casesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";
  const status = c.req.query("status") ?? "";
  const type = c.req.query("type") ?? "";

  let query = supabase
    .from("cases")
    .select("id, title, case_number, case_type, status, clients(name)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(26);

  if (search) query = query.ilike("title", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("case_type", type);

  const { data: cases } = await query;

  const rows = (cases ?? []).slice(0, 25).map((cs) => {
    const clientName = (cs.clients as unknown as { name: string } | null)?.name ?? "-";
    const statusBadge =
      cs.status === "active" ? <Badge color="green">Ativo</Badge> :
      cs.status === "suspended" ? <Badge color="yellow">Suspenso</Badge> :
      <Badge color="gray">Arquivado</Badge>;
    return [
      <a href={`/cases/${cs.id}`} class="text-navy-700 hover:underline">{cs.title}</a> as unknown as string,
      cs.case_number ?? "-",
      clientName,
      cs.case_type,
      statusBadge as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Processos", active: "cases" },
    <>
      <PageHeader
        title="Processos"
        icon="ph-folder-open"
        actions={() => <a href="/cases/new" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-plus" aria-hidden="true"></i>Novo Processo</a>}
      />
      <form method="get" action="/cases" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" value={search} placeholder="Titulo do processo..." icon="ph-magnifying-glass" />
        <Select label="Status" id="status" name="status" selected={status}
          options={[
            { value: "", label: "Todos" },
            { value: "active", label: "Ativo" },
            { value: "suspended", label: "Suspenso" },
            { value: "archived", label: "Arquivado" },
          ]}
        />
        <Select label="Tipo" id="type" name="type" selected={type}
          options={[{ value: "", label: "Todos" }, ...CASE_TYPES.map((t) => ({ value: t, label: t }))]}
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Titulo" }, { label: "Numero" }, { label: "Cliente" },
          { label: "Tipo" }, { label: "Status" },
        ]}
        rows={rows}
        emptyMsg="Nenhum processo encontrado."
        emptyIcon="ph-folder-open"
        ariaLabel="Lista de processos"
      />
    </>,
  );
});

// GET /cases/new -- create form.
casesRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("name");

  return renderPage(
    c,
    { title: "Novo Processo", active: "cases" },
    <>
      <PageHeader title="Novo Processo" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/cases" class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id" required
            options={(clients ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <TextField label="Titulo" id="title" name="title" required placeholder="Titulo do processo" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Numero" id="case_number" name="case_number" placeholder="CNJ ou numero interno" />
            <Select label="Tipo" id="case_type" name="case_type" required
              options={CASE_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Tribunal" id="tribunal" name="tribunal" />
            <Select label="Status" id="status" name="status" required selected="active"
              options={[
                { value: "active", label: "Ativo" },
                { value: "suspended", label: "Suspenso" },
                { value: "archived", label: "Arquivado" },
              ]}
            />
          </div>
          <Textarea label="Descricao" id="description" name="description" rows={4} />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/cases" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /cases -- create.
casesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = caseSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/cases/new");
  }

  const { data: newCase } = await supabase.from("cases").insert({
    tenant_id: user.tenantId,
    client_id: parsed.data.client_id,
    title: parsed.data.title,
    case_number: parsed.data.case_number || null,
    case_type: parsed.data.case_type,
    tribunal: parsed.data.tribunal || null,
    status: parsed.data.status,
    description: parsed.data.description || null,
  }).select("id").single();

  if (newCase) {
    // Log a case_event.
    await supabase.from("case_events").insert({
      tenant_id: user.tenantId,
      case_id: newCase.id,
      event_type: "case_created",
      description: "Processo criado",
      created_by: user.id,
    });
  }

  return c.redirect("/cases");
});

// GET /cases/:id -- detail with timeline, summary, next steps.
casesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: caseRow } = await supabase
    .from("cases")
    .select("*, clients(name, email, cpf, cnpj, phone, address)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!caseRow) return c.html("Processo nao encontrado.", 404);

  const [events, summary, deadlines, hearings, proceedings] = await Promise.all([
    supabase.from("case_events").select("*").eq("case_id", id).eq("tenant_id", user.tenantId).order("created_at", { ascending: false }),
    supabase.from("case_summaries").select("*").eq("case_id", id).eq("tenant_id", user.tenantId).single(),
    supabase.from("deadlines").select("id, title, due_date, completed_at, priority").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null).order("due_date", { ascending: true }),
    supabase.from("hearings").select("id, date, location, notes").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null).order("date", { ascending: true }),
    supabase.from("proceedings").select("id, cnj_number, tribunal").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null),
  ]);

  const client = caseRow.clients as { name: string; email?: string; cpf?: string; cnpj?: string; phone?: string; address?: string } | null;

  return renderPage(
    c,
    { title: caseRow.title, active: "cases" },
    <>
      <PageHeader
        title={caseRow.title}
        icon="ph-folder-open"
        actions={() => (
          <div class="flex gap-2">
            <a href={`/cases/${id}/edit`} class="btn btn-secondary"><i class="ph ph-pencil" aria-hidden="true"></i>Editar</a>
            <form method="post" action={`/cases/${id}/delete`}>
              <button type="submit" class="btn btn-danger" onclick="return confirm('Excluir este processo?')"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button>
            </form>
          </div>
        )}
      />

      <div class="grid grid-cols-3 gap-4 mb-6">
        <Panel title="Dados do processo" icon="ph-folder">
          <dl class="flex flex-col gap-1 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${caseRow.client_id}`} class="text-navy-700 hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Numero: </dt><dd class="inline">{caseRow.case_number ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{caseRow.case_type}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tribunal: </dt><dd class="inline">{caseRow.tribunal ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">
              <Badge color={caseRow.status === "active" ? "green" : caseRow.status === "suspended" ? "yellow" : "gray"}>
                {caseRow.status === "active" ? "Ativo" : caseRow.status === "suspended" ? "Suspenso" : "Arquivado"}
              </Badge>
            </dd></div>
          </dl>
        </Panel>

        <Panel title="Resumo IA" icon="ph-sparkle">
          {summary.data ? (
            <>
              <p class="text-body-sm text-gray-700 whitespace-pre-wrap mb-2">{summary.data.summary_text}</p>
              <div class="text-body-sm text-gray-400">Status: {summary.data.status}</div>
            </>
          ) : (
            <p class="text-body-sm text-gray-500 mb-2">Nenhum resumo gerado.</p>
          )}
          <form method="post" action={`/cases/${id}/summary`}>
            <button type="submit" class="btn btn-primary"><i class="ph ph-sparkle" aria-hidden="true"></i>Gerar resumo IA</button>
          </form>
        </Panel>

        <Panel title="Proximos passos IA" icon="ph-list-checks">
          <form method="post" action={`/cases/${id}/nextsteps`}>
            <button type="submit" class="btn btn-primary"><i class="ph ph-list-checks" aria-hidden="true"></i>Sugerir proximos passos</button>
          </form>
        </Panel>
      </div>

      {caseRow.description ? (
        <Panel title="Descricao" icon="ph-text-aa">
          <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{caseRow.description}</p>
        </Panel>
      ) : null}

      <div class="grid grid-cols-2 gap-4 mt-6">
        <Panel title="Prazos" icon="ph-clock-countdown">
          <Table
            columns={[{ label: "Prazo" }, { label: "Data" }, { label: "Prioridade" }, { label: "Status" }]}
            rows={(deadlines.data ?? []).map((d) => [
              d.title,
              new Date(d.due_date).toLocaleDateString("pt-BR"),
              `P${d.priority}`,
              d.completed_at ? <Badge color="gray">Concluido</Badge> : <Badge color="yellow">Pendente</Badge> as unknown as string,
            ])}
            emptyMsg="Nenhum prazo."
          />
        </Panel>
        <Panel title="Audiencias" icon="ph-gavel">
          <Table
            columns={[{ label: "Data" }, { label: "Local" }]}
            rows={(hearings.data ?? []).map((h) => [
              new Date(h.date).toLocaleString("pt-BR"),
              h.location ?? "-",
            ])}
            emptyMsg="Nenhuma audiencia."
          />
        </Panel>
      </div>

      <div class="grid grid-cols-2 gap-4 mt-6">
        <Panel title="Processos (CNJ)" icon="ph-scales">
          <Table
            columns={[{ label: "CNJ" }, { label: "Tribunal" }]}
            rows={(proceedings.data ?? []).map((p) => [
              <a href={`/proceedings/${p.id}`} class="text-navy-700 hover:underline">{p.cnj_number}</a> as unknown as string,
              p.tribunal ?? "-",
            ])}
            emptyMsg="Nenhum processo CNJ vinculado."
          />
        </Panel>
        <Panel title="Linha do tempo" icon="ph-timeline">
          <Table
            columns={[{ label: "Data" }, { label: "Evento" }, { label: "Descricao" }]}
            rows={(events.data ?? []).map((e: { created_at: string; event_type: string; description: string }) => [
              new Date(e.created_at).toLocaleDateString("pt-BR"),
              e.event_type,
              e.description,
            ])}
            emptyMsg="Nenhum evento registrado."
          />
        </Panel>
      </div>
    </>,
  );
});

// POST /cases/:id/summary -- generate AI summary.
casesRoutes.post("/:id/summary", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: caseRow } = await supabase
    .from("cases")
    .select("*, clients(name, cpf, cnpj, email, phone, address)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!caseRow) return c.html("Processo nao encontrado.", 404);

  const { data: events } = await supabase
    .from("case_events")
    .select("event_type, description, created_at")
    .eq("case_id", id)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  const client = caseRow.clients as unknown as { name: string; cpf?: string; cnpj?: string; email?: string; phone?: string; address?: string } | null;

  try {
    const summaryText = await generateCaseSummary(
      user.tenantId,
      {
        title: caseRow.title,
        case_number: caseRow.case_number ?? undefined,
        case_type: caseRow.case_type,
        tribunal: caseRow.tribunal ?? undefined,
        status: caseRow.status,
        description: caseRow.description ?? undefined,
      },
      events ?? [],
      {
        name: client?.name ?? "",
        cpf: client?.cpf,
        cnpj: client?.cnpj,
        email: client?.email,
        phone: client?.phone,
        address: client?.address,
      },
    );

    // Upsert summary.
    await supabase.from("case_summaries").upsert({
      tenant_id: user.tenantId,
      case_id: id,
      summary_text: summaryText,
      generated_by: user.id,
      status: "draft",
    }, { onConflict: "tenant_id,case_id" });

    // Log event.
    await supabase.from("case_events").insert({
      tenant_id: user.tenantId,
      case_id: id,
      event_type: "summary_generated",
      description: "Resumo gerado por IA",
      created_by: user.id,
    });
  } catch (err) {
    console.error("summary error:", err);
  }

  return c.redirect(`/cases/${id}`);
});

// POST /cases/:id/nextsteps -- suggest next steps via AI.
casesRoutes.post("/:id/nextsteps", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: caseRow } = await supabase
    .from("cases")
    .select("title, case_type, status, description")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!caseRow) return c.html("Processo nao encontrado.", 404);

  const { data: events } = await supabase
    .from("case_events")
    .select("event_type, description, created_at")
    .eq("case_id", id)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  try {
    const steps = await suggestNextSteps(user.tenantId, caseRow, events ?? []);
    await supabase.from("case_events").insert({
      tenant_id: user.tenantId,
      case_id: id,
      event_type: "next_steps_suggested",
      description: steps,
      created_by: user.id,
    });
  } catch (err) {
    console.error("nextsteps error:", err);
  }

  return c.redirect(`/cases/${id}`);
});

// GET /cases/:id/edit -- edit form.
casesRoutes.get("/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [caseRes, clientsRes] = await Promise.all([
    supabase.from("cases").select("*").eq("id", id).eq("tenant_id", user.tenantId).is("deleted_at", null).single(),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  if (!caseRes.data) return c.html("Processo nao encontrado.", 404);

  return renderPage(
    c,
    { title: `Editar ${caseRes.data.title}`, active: "cases" },
    <>
      <PageHeader title={`Editar ${caseRes.data.title}`} icon="ph-pencil" />
      <Panel>
        <form method="post" action={`/cases/${id}`} class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id" required selected={caseRes.data.client_id}
            options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <TextField label="Titulo" id="title" name="title" required value={caseRes.data.title} />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Numero" id="case_number" name="case_number" value={caseRes.data.case_number ?? ""} />
            <Select label="Tipo" id="case_type" name="case_type" required selected={caseRes.data.case_type}
              options={CASE_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Tribunal" id="tribunal" name="tribunal" value={caseRes.data.tribunal ?? ""} />
            <Select label="Status" id="status" name="status" required selected={caseRes.data.status}
              options={[
                { value: "active", label: "Ativo" },
                { value: "suspended", label: "Suspenso" },
                { value: "archived", label: "Arquivado" },
              ]}
            />
          </div>
          <Textarea label="Descricao" id="description" name="description" rows={4}>{caseRes.data.description ?? ""}</Textarea>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/cases/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /cases/:id -- update.
casesRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = caseSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/cases/${id}/edit`);

  await supabase.from("cases").update({
    client_id: parsed.data.client_id,
    title: parsed.data.title,
    case_number: parsed.data.case_number || null,
    case_type: parsed.data.case_type,
    tribunal: parsed.data.tribunal || null,
    status: parsed.data.status,
    description: parsed.data.description || null,
  }).eq("id", id).eq("tenant_id", user.tenantId);

  return c.redirect(`/cases/${id}`);
});

// POST /cases/:id/delete -- soft delete.
casesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("cases").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/cases");
});
