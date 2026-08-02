import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { generateCaseSummary, suggestNextSteps } from "../lib/ai";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, WizardModal, EmptyState } from "../components/ui";

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
  cause_value_cents: z.coerce.number().optional(),
  judge: z.string().optional(),
  district: z.string().optional(),
  court_branch: z.string().optional(),
  instance: z.string().optional(),
  phase: z.string().optional(),
  opposing_party: z.string().optional(),
  opposing_lawyer: z.string().optional(),
  case_class: z.string().optional(),
  subject: z.string().optional(),
});

const partySchema = z.object({
  party_type: z.enum(["autor", "reu", "advogado", "perito", "testemunha", "terceiro"]),
  name: z.string().min(1, "Nome e obrigatorio"),
  document: z.string().optional(),
  role: z.string().optional(),
  notes: z.string().optional(),
});

const riskSchema = z.object({
  win_probability: z.coerce.number().int().min(0).max(100).optional(),
  loss_probability: z.coerce.number().int().min(0).max(100).optional(),
  probable_value_cents: z.coerce.number().optional(),
  provision_cents: z.coerce.number().optional(),
  risk_notes: z.string().optional(),
});

const CASE_TYPES = [
  "Civel", "Trabalhista", "Penal", "Tributario", "Empresarial",
  "Familia", "Consumidor", "Administrativo", "Outro",
];

// GET /cases -- list.
casesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";
  const status = c.req.query("status") ?? "";
  const type = c.req.query("type") ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;
  if (status) queryParams.status = status;
  if (type) queryParams.type = type;

  let query = supabase
    .from("cases")
    .select("id, title, case_number, case_type, status, clients(name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("title", `%${search}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("case_type", type);

  query = query.range(offset, offset + limit - 1);

  const [casesRes, clientsRes] = await Promise.all([
    query,
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const cases = casesRes.data;
  const count = casesRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const clientOptions = (clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }));

  const rows = (cases ?? []).map((cs) => {
    const clientName = (cs.clients as unknown as { name: string } | null)?.name ?? "-";
    const statusBadge =
      cs.status === "active" ? <Badge color="green">Ativo</Badge> :
      cs.status === "suspended" ? <Badge color="yellow">Suspenso</Badge> :
      <Badge color="gray">Arquivado</Badge>;
    return [
      <a href={`/cases/${cs.id}`} class="text-[#0568ff] hover:underline">{cs.title}</a> as unknown as string,
      cs.case_number ?? "-",
      clientName,
      cs.case_type,
      statusBadge as unknown as string,
      <div class="flex items-center gap-2">
        <a href={`/cases/${cs.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
        <a href={`/cases/${cs.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
        <form method="post" action={`/cases/${cs.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
      </div> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Processos", active: "cases" },
    <>
      <PageHeader
        title="Processos"
        icon="ph-folder-open"
        actions={() => (
          <WizardModal
            id="new-case"
            title="Novo Processo"
            icon="ph-folder-open"
            triggerText="Novo Processo"
            triggerIcon="ph-plus"
            action="/cases"
            large
            steps={[
              {
                label: "Dados Principais",
                icon: "ph-folder",
                fields: (
                  <>
                    <ComboBox label="Cliente" id="client_id" name="client_id" required
                      options={clientOptions}
                    />
                    <TextField label="Titulo" id="title" name="title" required placeholder="Titulo do processo" />
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TextField label="Numero" id="case_number" name="case_number" placeholder="CNJ ou numero interno" />
                      <Select label="Tipo" id="case_type" name="case_type" required
                        options={CASE_TYPES.map((t) => ({ value: t, label: t }))}
                      />
                    </div>
                  </>
                ),
              },
              {
                label: "Parte Contraria",
                icon: "ph-users-three",
                fields: (
                  <>
                    <TextField label="Parte contraria" id="opposing_party" name="opposing_party" placeholder="Nome da parte contraria" />
                    <TextField label="Advogado contrario" id="opposing_lawyer" name="opposing_lawyer" placeholder="Nome do advogado contrario" />
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TextField label="Juiz" id="judge" name="judge" placeholder="Juiz responsavel" />
                      <TextField label="Tribunal" id="tribunal" name="tribunal" />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <TextField label="Comarca" id="district" name="district" />
                      <TextField label="Vara" id="court_branch" name="court_branch" />
                      <Select label="Instancia" id="instance" name="instance" selected="1"
                        options={[
                          { value: "1", label: "1 Grau" },
                          { value: "2", label: "2 Grau" },
                          { value: "STJ", label: "STJ" },
                          { value: "STF", label: "STF" },
                        ]}
                      />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <TextField label="Classe" id="case_class" name="case_class" placeholder="Classe processual" />
                      <TextField label="Assunto" id="subject" name="subject" placeholder="Assunto" />
                    </div>
                  </>
                ),
              },
              {
                label: "Valores",
                icon: "ph-currency-dollar",
                fields: (
                  <>
                    <TextField label="Valor da causa (R$)" id="cause_value_cents" name="cause_value_cents" type="number" step="0.01" placeholder="0,00" />
                    <Select label="Status" id="status" name="status" required selected="active"
                      options={[
                        { value: "active", label: "Ativo" },
                        { value: "suspended", label: "Suspenso" },
                        { value: "archived", label: "Arquivado" },
                      ]}
                    />
                    <TextField label="Fase" id="phase" name="phase" placeholder="Fase atual do processo" />
                    <Textarea label="Descricao" id="description" name="description" rows={4} />
                  </>
                ),
              },
            ]}
          />
        )}
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
          { label: "Tipo" }, { label: "Status" }, { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg={search ? `Nenhum processo encontrado para "${search}".` : "Nenhum processo cadastrado ainda."}
        emptyIcon="ph-folder-open"
        ariaLabel="Lista de processos"
        count={count ?? 0}
        countLabel="processo(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/cases",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /cases -- create.
casesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = caseSchema.safeParse(body);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados invalidos";
    return c.redirect(`/cases?error=${encodeURIComponent(firstError)}`);
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
    cause_value_cents: parsed.data.cause_value_cents ? Math.round(parsed.data.cause_value_cents * 100) : 0,
    judge: parsed.data.judge || null,
    district: parsed.data.district || null,
    court_branch: parsed.data.court_branch || null,
    instance: parsed.data.instance || "1",
    phase: parsed.data.phase || null,
    opposing_party: parsed.data.opposing_party || null,
    opposing_lawyer: parsed.data.opposing_lawyer || null,
    case_class: parsed.data.case_class || null,
    subject: parsed.data.subject || null,
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

  setFlash(c, "success", "Processo criado com sucesso!");
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

  const [events, summary, deadlines, hearings, proceedings, parties, risk, clientsRes] = await Promise.all([
    supabase.from("case_events").select("*").eq("case_id", id).eq("tenant_id", user.tenantId).order("created_at", { ascending: false }),
    supabase.from("case_summaries").select("*").eq("case_id", id).eq("tenant_id", user.tenantId).single(),
    supabase.from("deadlines").select("id, title, due_date, completed_at, priority").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null).order("due_date", { ascending: true }),
    supabase.from("hearings").select("id, date, location, notes").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null).order("date", { ascending: true }),
    supabase.from("proceedings").select("id, cnj_number, tribunal, sync_status, last_synced_at").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null),
    supabase.from("case_parties").select("*").eq("case_id", id).eq("tenant_id", user.tenantId).is("deleted_at", null).order("party_type"),
    supabase.from("case_risk").select("*").eq("case_id", id).eq("tenant_id", user.tenantId).single(),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
  ]);

  const client = caseRow.clients as { name: string; email?: string; cpf?: string; cnpj?: string; phone?: string; address?: string } | null;
  const clientOptions = (clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }));

  return renderPage(
    c,
    { title: caseRow.title, active: "cases" },
    <>
      <PageHeader
        title={caseRow.title}
        icon="ph-folder-open"
        actions={() => (
          <div class="flex gap-2">
            <WizardModal
              id="edit-case"
              title={`Editar ${caseRow.title}`}
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/cases/${caseRow.id}`}
              large
              steps={[
                {
                  label: "Dados Principais",
                  icon: "ph-folder",
                  fields: (
                    <>
                      <ComboBox label="Cliente" id="client_id" name="client_id" required selected={caseRow.client_id}
                        options={clientOptions}
                      />
                      <TextField label="Titulo" id="title" name="title" required value={caseRow.title} />
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <TextField label="Numero" id="case_number" name="case_number" value={caseRow.case_number ?? ""} />
                        <Select label="Tipo" id="case_type" name="case_type" required selected={caseRow.case_type}
                          options={CASE_TYPES.map((t) => ({ value: t, label: t }))}
                        />
                      </div>
                    </>
                  ),
                },
                {
                  label: "Parte Contraria",
                  icon: "ph-users-three",
                  fields: (
                    <>
                      <TextField label="Parte contraria" id="opposing_party" name="opposing_party" value={caseRow.opposing_party ?? ""} />
                      <TextField label="Advogado contrario" id="opposing_lawyer" name="opposing_lawyer" />
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <TextField label="Juiz" id="judge" name="judge" value={caseRow.judge ?? ""} />
                        <TextField label="Tribunal" id="tribunal" name="tribunal" value={caseRow.tribunal ?? ""} />
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <TextField label="Comarca" id="district" name="district" value={caseRow.district ?? ""} />
                        <TextField label="Vara" id="court_branch" name="court_branch" value={caseRow.court_branch ?? ""} />
                        <Select label="Instancia" id="instance" name="instance" selected={caseRow.instance ?? "1"}
                          options={[
                            { value: "1", label: "1 Grau" },
                            { value: "2", label: "2 Grau" },
                            { value: "STJ", label: "STJ" },
                            { value: "STF", label: "STF" },
                          ]}
                        />
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <TextField label="Classe" id="case_class" name="case_class" value={caseRow.case_class ?? ""} />
                        <TextField label="Assunto" id="subject" name="subject" value={caseRow.subject ?? ""} />
                      </div>
                    </>
                  ),
                },
                {
                  label: "Valores",
                  icon: "ph-currency-dollar",
                  fields: (
                    <>
                      <TextField label="Valor da causa (R$)" id="cause_value_cents" name="cause_value_cents" type="number" step="0.01" value={caseRow.cause_value_cents ? String(caseRow.cause_value_cents / 100) : ""} />
                      <Select label="Status" id="status" name="status" required selected={caseRow.status}
                        options={[
                          { value: "active", label: "Ativo" },
                          { value: "suspended", label: "Suspenso" },
                          { value: "archived", label: "Arquivado" },
                        ]}
                      />
                      <TextField label="Fase" id="phase" name="phase" value={caseRow.phase ?? ""} />
                      <Textarea label="Descricao" id="description" name="description" rows={4}>{caseRow.description ?? ""}</Textarea>
                    </>
                  ),
                },
              ]}
            />
            <form method="post" action={`/cases/${id}/delete`}>
              <button type="submit" class="btn btn-danger" onclick="return confirm('Excluir este processo?')" aria-label="Excluir"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button>
            </form>
          </div>
        )}
      />

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Panel title="Dados do processo" icon="ph-folder">
          <dl class="flex flex-col gap-1 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${caseRow.client_id}`} class="text-[#0568ff] hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Numero: </dt><dd class="inline">{caseRow.case_number ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{caseRow.case_type}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tribunal: </dt><dd class="inline">{caseRow.tribunal ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Comarca: </dt><dd class="inline">{caseRow.district ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Vara: </dt><dd class="inline">{caseRow.court_branch ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Instancia: </dt><dd class="inline">{caseRow.instance ?? "1"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Juiz: </dt><dd class="inline">{caseRow.judge ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Parte contraria: </dt><dd class="inline">{caseRow.opposing_party ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Classe: </dt><dd class="inline">{caseRow.case_class ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Assunto: </dt><dd class="inline">{caseRow.subject ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Fase: </dt><dd class="inline">{caseRow.phase ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor da causa: </dt><dd class="inline">{caseRow.cause_value_cents ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(caseRow.cause_value_cents / 100) : "-"}</dd></div>
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

      {/* Partes e Risco */}
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Partes do processo" icon="ph-users-three">
          <Table
            columns={[{ label: "Tipo", icon: "ph-tag" }, { label: "Nome", icon: "ph-user" }, { label: "Documento", icon: "ph-identification-card" }, { label: "Acoes" }]}
            rows={(parties.data ?? []).map((p) => [
              <Badge color={p.party_type === "autor" ? "green" : p.party_type === "reu" ? "red" : "blue"}>{p.party_type}</Badge> as unknown as string,
              p.name,
              p.document ?? "-",
              <form method="post" action={`/cases/${id}/parties/${p.id}/delete`}>
                <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Remover esta parte?')" aria-label="Remover parte">
                  <i class="ph ph-trash" aria-hidden="true"></i>
                </button>
              </form> as unknown as string,
            ])}
            emptyMsg="Nenhuma parte cadastrada."
            emptyIcon="ph-users-three"
          />
          <form method="post" action={`/cases/${id}/parties`} class="mt-3 flex flex-wrap gap-2 items-end">
            <Select label="Tipo" id="party_type" name="party_type" required
              options={[
                { value: "autor", label: "Autor" },
                { value: "reu", label: "Reu" },
                { value: "advogado", label: "Advogado" },
                { value: "perito", label: "Perito" },
                { value: "testemunha", label: "Testemunha" },
                { value: "terceiro", label: "Terceiro" },
              ]}
            />
            <TextField label="Nome" id="party_name" name="name" required placeholder="Nome da parte" />
            <TextField label="Documento" id="party_document" name="document" placeholder="CPF/CNPJ/OAB" />
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-plus" aria-hidden="true"></i>Adicionar
            </button>
          </form>
        </Panel>

        <Panel title="Controle de risco" icon="ph-gauge">
          {risk.data ? (
            <dl class="flex flex-col gap-2 text-body-sm mb-3">
              <div><dt class="font-semibold text-gray-700 inline">Prob. de ganho: </dt><dd class="inline"><Badge color={risk.data.win_probability >= 60 ? "green" : risk.data.win_probability >= 40 ? "yellow" : "red"}>{risk.data.win_probability ?? 0}%</Badge></dd></div>
              <div><dt class="font-semibold text-gray-700 inline">Prob. de perda: </dt><dd class="inline"><Badge color={risk.data.loss_probability >= 60 ? "red" : risk.data.loss_probability >= 40 ? "yellow" : "green"}>{risk.data.loss_probability ?? 0}%</Badge></dd></div>
              <div><dt class="font-semibold text-gray-700 inline">Valor provavel: </dt><dd class="inline">{risk.data.probable_value_cents ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(risk.data.probable_value_cents / 100) : "-"}</dd></div>
              <div><dt class="font-semibold text-gray-700 inline">Provisionamento: </dt><dd class="inline">{risk.data.provision_cents ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(risk.data.provision_cents / 100) : "-"}</dd></div>
              {risk.data.risk_notes ? <div class="mt-1 text-gray-600 whitespace-pre-wrap">{risk.data.risk_notes}</div> : null}
            </dl>
          ) : (
            <p class="text-body-sm text-gray-500 mb-3">Nenhuma analise de risco cadastrada.</p>
          )}
          <form method="post" action={`/cases/${id}/risk`} class="flex flex-col gap-2">
            <div class="grid grid-cols-2 gap-2">
              <TextField label="Prob. ganho (%)" id="win_probability" name="win_probability" type="number" min="0" max="100" value={risk.data?.win_probability ? String(risk.data.win_probability) : ""} />
              <TextField label="Prob. perda (%)" id="loss_probability" name="loss_probability" type="number" min="0" max="100" value={risk.data?.loss_probability ? String(risk.data.loss_probability) : ""} />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <TextField label="Valor provavel (R$)" id="probable_value_cents" name="probable_value_cents" type="number" step="0.01" value={risk.data?.probable_value_cents ? String(risk.data.probable_value_cents / 100) : ""} />
              <TextField label="Provisionamento (R$)" id="provision_cents" name="provision_cents" type="number" step="0.01" value={risk.data?.provision_cents ? String(risk.data.provision_cents / 100) : ""} />
            </div>
            <TextField label="Observacoes de risco" id="risk_notes" name="risk_notes" value={risk.data?.risk_notes ?? ""} />
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1 self-start">
              <i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar risco
            </button>
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
            columns={[{ label: "Prazo" }, { label: "Data" }, { label: "Prioridade" }, { label: "Status" }, { label: "Acoes" }]}
            rows={(deadlines.data ?? []).map((d) => [
              d.title,
              new Date(d.due_date).toLocaleDateString("pt-BR"),
              `P${d.priority}`,
              d.completed_at ? <Badge color="gray">Concluido</Badge> : <Badge color="yellow">Pendente</Badge> as unknown as string,
              <a href={`/deadlines/${d.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
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
          <div class="mb-3 flex justify-end">
            <a href={`/proceedings/search-cnj?case_id=${caseRow.id}`} class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-download-simple" aria-hidden="true"></i>
              Importar do DataJud
            </a>
          </div>
          <Table
            columns={[{ label: "CNJ" }, { label: "Tribunal" }, { label: "Sync" }]}
            rows={(proceedings.data ?? []).map((p) => {
              const syncBadge =
                p.sync_status === "synced" ? <Badge color="green" icon="ph-arrows-clockwise">Sincronizado</Badge> :
                p.sync_status === "pending" ? <Badge color="yellow" icon="ph-clock">Pendente</Badge> :
                p.sync_status === "error" ? <Badge color="red" icon="ph-warning">Erro</Badge> :
                null;
              return [
                <a href={`/proceedings/${p.id}`} class="text-[#0568ff] hover:underline">{p.cnj_number}</a> as unknown as string,
                p.tribunal ?? "-",
                syncBadge as unknown as string,
              ];
            })}
            emptyMsg="Nenhum processo CNJ vinculado."
          />
        </Panel>
        <Panel title="Linha do tempo" icon="ph-list-dashes">
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

// POST /cases/:id/parties -- add a party.
casesRoutes.post("/:id/parties", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = partySchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/cases/${id}`);

  await supabase.from("case_parties").insert({
    tenant_id: user.tenantId,
    case_id: id,
    party_type: parsed.data.party_type,
    name: parsed.data.name,
    document: parsed.data.document || null,
    role: parsed.data.role || null,
    notes: parsed.data.notes || null,
  });

  return c.redirect(`/cases/${id}`);
});

// POST /cases/:id/parties/:pid/delete -- remove a party.
casesRoutes.post("/:id/parties/:pid/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const pid = c.req.param("pid");
  await supabase.from("case_parties").update({ deleted_at: new Date().toISOString() }).eq("id", pid).eq("tenant_id", user.tenantId);
  return c.redirect(`/cases/${id}`);
});

// POST /cases/:id/risk -- upsert risk assessment.
casesRoutes.post("/:id/risk", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = riskSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/cases/${id}`);

  await supabase.from("case_risk").upsert({
    tenant_id: user.tenantId,
    case_id: id,
    win_probability: parsed.data.win_probability ?? null,
    loss_probability: parsed.data.loss_probability ?? null,
    probable_value_cents: parsed.data.probable_value_cents ? Math.round(parsed.data.probable_value_cents * 100) : 0,
    provision_cents: parsed.data.provision_cents ? Math.round(parsed.data.provision_cents * 100) : 0,
    risk_notes: parsed.data.risk_notes || null,
    updated_by: user.id,
  }, { onConflict: "tenant_id,case_id" });

  return c.redirect(`/cases/${id}`);
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

// POST /cases/:id -- update.
casesRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = caseSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/cases/${id}`);

  await supabase.from("cases").update({
    client_id: parsed.data.client_id,
    title: parsed.data.title,
    case_number: parsed.data.case_number || null,
    case_type: parsed.data.case_type,
    tribunal: parsed.data.tribunal || null,
    status: parsed.data.status,
    description: parsed.data.description || null,
    cause_value_cents: parsed.data.cause_value_cents ? Math.round(parsed.data.cause_value_cents * 100) : 0,
    judge: parsed.data.judge || null,
    district: parsed.data.district || null,
    court_branch: parsed.data.court_branch || null,
    instance: parsed.data.instance || "1",
    phase: parsed.data.phase || null,
    opposing_party: parsed.data.opposing_party || null,
    opposing_lawyer: parsed.data.opposing_lawyer || null,
    case_class: parsed.data.case_class || null,
    subject: parsed.data.subject || null,
  }).eq("id", id).eq("tenant_id", user.tenantId);

  setFlash(c, "success", "Processo atualizado com sucesso!");
  return c.redirect(`/cases/${id}`);
});

// POST /cases/:id/delete -- soft delete.
casesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("cases").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  setFlash(c, "success", "Processo excluido com sucesso.");
  return c.redirect("/cases");
});
