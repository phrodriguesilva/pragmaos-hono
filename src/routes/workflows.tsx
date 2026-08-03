import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { caseBelongsToTenant, clientBelongsToTenant, profileBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge, WizardModal } from "../components/ui";
import { workflowExecRateLimit } from "../lib/rate-limit";

export const workflowsRoutes = new Hono<AppEnv>();

workflowsRoutes.use("*", requireAuth);

// --- Constants -------------------------------------------------------------

const TRIGGER_TYPES: { value: string; label: string; icon: string }[] = [
  { value: "new_client", label: "Novo Cliente", icon: "ph-user-plus" },
  { value: "new_case", label: "Novo Processo", icon: "ph-folder-open" },
  { value: "new_lead", label: "Novo Lead", icon: "ph-target" },
  { value: "deadline_due", label: "Prazo Vencendo", icon: "ph-timer" },
  { value: "hearing_scheduled", label: "Audiencia Agendada", icon: "ph-gavel" },
  { value: "manual", label: "Manual", icon: "ph-hand-tap" },
];

const ACTION_TYPES: { value: string; label: string; icon: string }[] = [
  { value: "create_task", label: "Criar Tarefa", icon: "ph-check-square" },
  { value: "create_deadline", label: "Criar Prazo", icon: "ph-timer" },
  { value: "create_hearing", label: "Criar Audiencia", icon: "ph-gavel" },
  { value: "send_message", label: "Enviar Mensagem", icon: "ph-chat-circle" },
  { value: "create_document", label: "Criar Documento", icon: "ph-file-text" },
  { value: "create_invoice", label: "Criar Fatura", icon: "ph-receipt" },
  { value: "send_email", label: "Enviar Email", icon: "ph-envelope" },
  { value: "send_whatsapp", label: "Enviar WhatsApp", icon: "ph-whatsapp-logo" },
  { value: "update_case", label: "Atualizar Processo", icon: "ph-folder-open" },
  { value: "create_event", label: "Criar Evento", icon: "ph-calendar-plus" },
];

const triggerLabel = (t: string) => TRIGGER_TYPES.find((x) => x.value === t)?.label ?? t;
const triggerIcon = (t: string) => TRIGGER_TYPES.find((x) => x.value === t)?.icon ?? "ph-gear-six";
const actionLabel = (a: string) => ACTION_TYPES.find((x) => x.value === a)?.label ?? a;
const actionIcon = (a: string) => ACTION_TYPES.find((x) => x.value === a)?.icon ?? "ph-gear";

// --- Schemas ----------------------------------------------------------------

const workflowSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio").max(255),
  description: z.string().max(2000).optional(),
  trigger_type: z.enum(["new_client", "new_case", "new_lead", "deadline_due", "hearing_scheduled", "manual"]),
  active: z.string().optional(),
});

const stepSchema = z.object({
  name: z.string().min(1, "Nome do passo e obrigatorio").max(255),
  action_type: z.enum([
    "create_task", "create_deadline", "create_hearing", "send_message",
    "create_document", "create_invoice", "send_email", "send_whatsapp",
    "update_case", "create_event",
  ]),
  action_config: z.string().max(10000).optional(),
});

// --- Helpers ----------------------------------------------------------------

// Parse a JSON action_config string into an object, tolerating empty/invalid input.
function parseConfig(raw?: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const str = (cfg: Record<string, unknown>, key: string): string | null => {
  const v = cfg[key];
  return typeof v === "string" && v.trim() ? v : null;
};

const num = (cfg: Record<string, unknown>, key: string): number | null => {
  const v = cfg[key];
  return typeof v === "number" && !isNaN(v) ? v : null;
};

// --- Routes -----------------------------------------------------------------

// GET /workflows -- list workflows.
workflowsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let query = supabase
    .from("workflows")
    .select("id, name, trigger_type, active, created_at", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) query = query.ilike("name", `%${search}%`);

  query = query.range(offset, offset + limit - 1);

  const { data: workflows, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  // Fetch step counts and last execution per workflow in parallel.
  const wfList = workflows ?? [];
  const [stepsRes, execRes] = await Promise.all([
    supabase
      .from("workflow_steps")
      .select("workflow_id")
      .in(
        "workflow_id",
        wfList.map((w) => w.id),
      ),
    supabase
      .from("workflow_executions")
      .select("workflow_id, started_at, status")
      .in(
        "workflow_id",
        wfList.map((w) => w.id),
      )
      .order("started_at", { ascending: false }),
  ]);

  const stepCounts = new Map<string, number>();
  for (const s of stepsRes.data ?? []) {
    stepCounts.set(s.workflow_id, (stepCounts.get(s.workflow_id) ?? 0) + 1);
  }

  const lastExec = new Map<string, string>();
  for (const e of execRes.data ?? []) {
    if (!lastExec.has(e.workflow_id) && e.started_at) {
      lastExec.set(e.workflow_id, e.started_at);
    }
  }

  const rows = wfList.map((w) => {
    const steps = stepCounts.get(w.id) ?? 0;
    const last = lastExec.get(w.id);
    return [
      <a href={`/workflows/${w.id}`} class="text-[#0568ff] hover:underline">{w.name}</a> as unknown as string,
      <span class="inline-flex items-center gap-1">
        <i class={`ph ${triggerIcon(w.trigger_type)}`} aria-hidden="true" />
        {triggerLabel(w.trigger_type)}
      </span> as unknown as string,
      steps > 0 ? `${steps} passo${steps > 1 ? "s" : ""}` : "-",
      w.active
        ? <Badge color="green" icon="ph-check-circle">Ativo</Badge> as unknown as string
        : <Badge color="gray" icon="ph-x-circle">Inativo</Badge> as unknown as string,
      last ? new Date(last).toLocaleString("pt-BR") : "-",
      <div class="flex items-center gap-2">
        <a href={`/workflows/${w.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
        <a href={`/workflows/${w.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
        <form method="post" action={`/workflows/${w.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
      </div> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Workflows", active: "workflows" },
    <>
      <PageHeader
        title="Workflows"
        icon="ph-gear-six"
        actions={() => (
          <WizardModal
            id="new-workflow"
            title="Novo Workflow"
            icon="ph-gear-six"
            triggerText="Novo Workflow"
            triggerIcon="ph-plus"
            action="/workflows"
            submitLabel="Salvar"
            large
            steps={[
              {
                label: "Dados Basicos",
                icon: "ph-info",
                fields: (
                  <>
                    <TextField label="Nome" id="name" name="name" required icon="ph-text-aa" placeholder="Ex.: Onboarding de novo cliente" />
                    <Textarea label="Descricao" id="description" name="description" rows={3}>
                      {"Para que serve este workflow..."}
                    </Textarea>
                    <label class="flex items-center gap-2 text-body-sm font-semibold text-gray-700">
                      <input type="checkbox" name="active" value="1" checked />
                      Ativo
                    </label>
                  </>
                ),
              },
              {
                label: "Gatilho",
                icon: "ph-lightning",
                fields: (
                  <>
                    <Select
                      label="Gatilho"
                      id="trigger_type"
                      name="trigger_type"
                      required
                      icon="ph-lightning"
                      selected="manual"
                      options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                    />
                    <Textarea label="Configuracao do Gatilho (JSON)" id="trigger_config" name="trigger_config" rows={4}>
                      {"{\n  \n}"}
                    </Textarea>
                  </>
                ),
              },
              {
                label: "Acoes",
                icon: "ph-gear",
                fields: (
                  <>
                    <Select
                      label="Acao"
                      id="action_type"
                      name="action_type"
                      icon="ph-gear"
                      options={ACTION_TYPES.map((a) => ({ value: a.value, label: a.label }))}
                    />
                    <Textarea label="Configuracao da Acao (JSON)" id="action_config" name="action_config" rows={4}>
                      {"{\n  \n}"}
                    </Textarea>
                  </>
                ),
              },
            ]}
          />
        )}
      />
      <form method="get" action="/workflows" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Nome do workflow..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Nome", icon: "ph-text-aa" },
          { label: "Gatilho", icon: "ph-lightning" },
          { label: "Passos", icon: "ph-list-numbers" },
          { label: "Ativo", icon: "ph-power" },
          { label: "Ultima execucao", icon: "ph-clock" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum workflow configurado."
        emptyIcon="ph-gear-six"
        ariaLabel="Lista de workflows"
        count={count ?? 0}
        countLabel="workflow(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/workflows",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /workflows -- create workflow.
workflowsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = workflowSchema.safeParse(body);

  if (!parsed.success) return c.redirect("/workflows");

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      tenant_id: user.tenantId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      trigger_type: parsed.data.trigger_type,
      trigger_config: {},
      active: parsed.data.active === "1",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return c.redirect("/workflows");

  return c.redirect(`/workflows/${data.id}`);
});

// GET /workflows/:id -- workflow detail.
workflowsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: wf } = await supabase
    .from("workflows")
    .select("id, name, description, trigger_type, trigger_config, active, created_at")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!wf) return c.redirect("/workflows");

  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("id, step_order, action_type, action_config, name")
    .eq("workflow_id", id)
    .eq("tenant_id", user.tenantId)
    .order("step_order", { ascending: true });

  const { data: executions } = await supabase
    .from("workflow_executions")
    .select("id, status, started_at, completed_at, error, steps_completed, steps_total")
    .eq("workflow_id", id)
    .eq("tenant_id", user.tenantId)
    .order("started_at", { ascending: false })
    .limit(15);

  const execRows = (executions ?? []).map((e) => {
    const statusBadge =
      e.status === "completed" ? <Badge color="green" icon="ph-check-circle">Concluido</Badge> :
      e.status === "failed" ? <Badge color="red" icon="ph-x-circle">Falhou</Badge> :
      e.status === "running" ? <Badge color="blue" icon="ph-circle-notch">Em execucao</Badge> :
      <Badge color="gray" icon="ph-circle">{e.status}</Badge>;
    return [
      e.started_at ? new Date(e.started_at).toLocaleString("pt-BR") : "-",
      statusBadge as unknown as string,
      `${e.steps_completed ?? 0}/${e.steps_total ?? 0}`,
      e.error ?? "-",
    ];
  });

  const stepsList = steps ?? [];

  return renderPage(
    c,
    { title: wf.name, active: "workflows" },
    <>
      <PageHeader
        title={wf.name}
        icon="ph-gear-six"
        actions={() => (
          <div class="flex gap-2">
            <WizardModal
              id="edit-workflow"
              title={`Editar - ${wf.name}`}
              icon="ph-gear-six"
              triggerText="Editar"
              triggerIcon="ph-pencil-simple"
              triggerVariant="secondary"
              action={`/workflows/${wf.id}`}
              submitLabel="Salvar"
              large
              steps={[
                {
                  label: "Dados Basicos",
                  icon: "ph-info",
                  fields: (
                    <>
                      <TextField label="Nome" id="name" name="name" required icon="ph-text-aa" value={wf.name} />
                      <Textarea label="Descricao" id="description" name="description" rows={3}>
                        {wf.description ?? ""}
                      </Textarea>
                      <label class="flex items-center gap-2 text-body-sm font-semibold text-gray-700">
                        <input type="checkbox" name="active" value="1" checked={wf.active} />
                        Ativo
                      </label>
                    </>
                  ),
                },
                {
                  label: "Gatilho",
                  icon: "ph-lightning",
                  fields: (
                    <>
                      <Select
                        label="Gatilho"
                        id="trigger_type"
                        name="trigger_type"
                        required
                        icon="ph-lightning"
                        selected={wf.trigger_type}
                        options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                      />
                      <Textarea label="Configuracao do Gatilho (JSON)" id="trigger_config" name="trigger_config" rows={4}>
                        {wf.trigger_config ? JSON.stringify(wf.trigger_config, null, 2) : "{\n  \n}"}
                      </Textarea>
                    </>
                  ),
                },
                {
                  label: "Acoes",
                  icon: "ph-gear",
                  fields: (
                    <>
                      <Select
                        label="Acao"
                        id="action_type"
                        name="action_type"
                        icon="ph-gear"
                        options={ACTION_TYPES.map((a) => ({ value: a.value, label: a.label }))}
                      />
                      <Textarea label="Configuracao da Acao (JSON)" id="action_config" name="action_config" rows={4}>
                        {"{\n  \n}"}
                      </Textarea>
                    </>
                  ),
                },
              ]}
            />
            {wf.trigger_type === "manual" ? (
              <form method="post" action={`/workflows/${wf.id}/execute`} class="inline">
                <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
                  <i class="ph ph-play" aria-hidden="true" />
                  Executar Agora
                </button>
              </form>
            ) : null}
          </div>
        )}
      />

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-1">
            <i class="ph ph-lightning" aria-hidden="true" /> Gatilho
          </div>
          <div class="text-body font-semibold text-gray-800 flex items-center gap-1 mt-1">
            <i class={`ph ${triggerIcon(wf.trigger_type)}`} aria-hidden="true" />
            {triggerLabel(wf.trigger_type)}
          </div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-1">
            <i class="ph ph-power" aria-hidden="true" /> Status
          </div>
          <div class="mt-1 flex items-center gap-2">
            {wf.active
              ? <Badge color="green" icon="ph-check-circle">Ativo</Badge>
              : <Badge color="gray" icon="ph-x-circle">Inativo</Badge>}
            <form method="post" action={`/workflows/${wf.id}/toggle`} class="inline">
              <button type="submit" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-arrows-clockwise" aria-hidden="true" />
                {wf.active ? "Desativar" : "Ativar"}
              </button>
            </form>
          </div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-1">
            <i class="ph ph-list-numbers" aria-hidden="true" /> Passos
          </div>
          <div class="text-body font-semibold text-gray-800 mt-1">{stepsList.length}</div>
        </Panel>
      </div>

      {wf.description ? (
        <Panel title="Descricao" icon="ph-text-aa" >
          <p class="text-body text-gray-700 whitespace-pre-wrap">{wf.description}</p>
        </Panel>
      ) : null}

      <Panel title="Passos do Workflow" icon="ph-list-numbers">
        {stepsList.length === 0 ? (
          <div class="text-body-sm text-gray-500 text-center py-4">
            <i class="ph ph-tray text-h2 block mb-1 text-gray-300" aria-hidden="true" />
            Nenhum passo adicionado. Use o formulario abaixo.
          </div>
        ) : (
          <ol class="flex flex-col gap-2 mb-4">
            {stepsList.map((s, i) => (
              <li class="border border-gray-200 bg-gray-50 p-3 flex items-center gap-3">
                <span class="text-body font-bold text-[#0568ff] w-6 text-center">{i + 1}</span>
                <div class="flex-1">
                  <div class="text-body font-semibold text-gray-800 flex items-center gap-1">
                    <i class={`ph ${actionIcon(s.action_type)}`} aria-hidden="true" />
                    {s.name}
                  </div>
                  <div class="text-body-sm text-gray-500 flex items-center gap-1">
                    <Badge color="blue" icon={actionIcon(s.action_type)}>{actionLabel(s.action_type)}</Badge>
                    {s.action_config ? <code class="text-body-sm text-gray-600">{s.action_config}</code> : null}
                  </div>
                </div>
                <form method="post" action={`/workflows/${wf.id}/steps/${s.id}/delete`} class="inline">
                  <button type="submit" class="btn btn-danger inline-flex items-center gap-1" aria-label="Remover">
                    <i class="ph ph-trash" aria-hidden="true" />
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ol>
        )}

        <form method="post" action={`/workflows/${wf.id}/steps`} class="flex flex-col gap-3 border-t border-gray-200 pt-3">
          <h3 class="text-h3 font-semibold text-gray-800 flex items-center gap-1">
            <i class="ph ph-plus-circle" aria-hidden="true" />
            Adicionar Passo
          </h3>
          <TextField label="Nome do passo" id="name" name="name" required icon="ph-text-aa" placeholder="Ex.: Criar tarefa de contrato" />
          <Select
            label="Acao"
            id="action_type"
            name="action_type"
            required
            icon="ph-gear"
            options={ACTION_TYPES.map((a) => ({ value: a.value, label: a.label }))}
          />
          <Textarea
            label="Configuracao (JSON)"
            id="action_config"
            name="action_config"
            rows={3}
          >
            {`{"title": "Criar contrato", "priority": 3}`}
          </Textarea>
          <div>
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-plus" aria-hidden="true" />
              Adicionar Passo
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Historico de Execucoes" icon="ph-clock">
        <Table
          columns={[
            { label: "Data", icon: "ph-calendar" },
            { label: "Status", icon: "ph-circle-half" },
            { label: "Passos completados", icon: "ph-list-numbers" },
            { label: "Erro", icon: "ph-warning" },
          ]}
          rows={execRows}
          emptyMsg="Nenhuma execucao registrada."
          emptyIcon="ph-clock"
          ariaLabel="Historico de execucoes"
        />
      </Panel>
    </>,
  );
});

// POST /workflows/:id/steps -- add a step.
workflowsRoutes.post("/:id/steps", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = stepSchema.safeParse(body);

  if (!parsed.success) return c.redirect(`/workflows/${id}`);

  // Determine the next step_order.
  const { data: existing } = await supabase
    .from("workflow_steps")
    .select("step_order")
    .eq("workflow_id", id)
    .eq("tenant_id", user.tenantId)
    .order("step_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing && existing.length > 0 ? (existing[0]?.step_order ?? 0) : 0) + 1;

  // Validate JSON config if provided.
  const rawConfig = parsed.data.action_config?.trim() ?? "";
  let configValue: unknown = {};
  if (rawConfig) {
    try {
      configValue = JSON.parse(rawConfig);
    } catch {
      return c.redirect(`/workflows/${id}`);
    }
  }

  await supabase.from("workflow_steps").insert({
    tenant_id: user.tenantId,
    workflow_id: id,
    step_order: nextOrder,
    action_type: parsed.data.action_type,
    action_config: configValue,
    name: parsed.data.name,
  });

  return c.redirect(`/workflows/${id}`);
});

// POST /workflows/:id/steps/:sid/delete -- remove a step.
workflowsRoutes.post("/:id/steps/:sid/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const sid = c.req.param("sid");

  await supabase
    .from("workflow_steps")
    .delete()
    .eq("id", sid)
    .eq("workflow_id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/workflows/${id}`);
});

// POST /workflows/:id/execute -- manually execute the workflow.
workflowsRoutes.post("/:id/execute", workflowExecRateLimit, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: wf } = await supabase
    .from("workflows")
    .select("id, name, trigger_type")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!wf) return c.redirect("/workflows");

  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("id, step_order, action_type, action_config, name")
    .eq("workflow_id", id)
    .eq("tenant_id", user.tenantId)
    .order("step_order", { ascending: true });

  const stepList = steps ?? [];
  const total = stepList.length;
  const now = new Date().toISOString();

  // Create the execution record.
  const { data: exec } = await supabase
    .from("workflow_executions")
    .insert({
      tenant_id: user.tenantId,
      workflow_id: id,
      entity_type: "manual",
      entity_id: null,
      status: "running",
      started_at: now,
      steps_completed: 0,
      steps_total: total,
    })
    .select("id")
    .single();

  const execId = exec?.id;
  let completed = 0;
  let lastError: string | null = null;

  // Track created resources for compensating rollback on failure.
  const createdResources: { table: string; id: string }[] = [];

  // Iterate through steps and perform each action.
  for (const step of stepList) {
    const cfg = parseConfig(typeof step.action_config === "string" ? step.action_config : JSON.stringify(step.action_config ?? {}));
    try {
      // Validate IDOR-relevant foreign keys from action_config before any insert.
      const cfgCaseId = str(cfg, "case_id");
      const cfgClientId = str(cfg, "client_id");
      const cfgAssignedTo = str(cfg, "assigned_to");
      if (cfgCaseId) {
        const owns = await caseBelongsToTenant(cfgCaseId, user.tenantId);
        if (!owns) { lastError = "Processo nao encontrado."; break; }
      }
      if (cfgClientId) {
        const owns = await clientBelongsToTenant(cfgClientId, user.tenantId);
        if (!owns) { lastError = "Cliente nao encontrado."; break; }
      }
      if (cfgAssignedTo) {
        const owns = await profileBelongsToTenant(cfgAssignedTo, user.tenantId);
        if (!owns) { lastError = "Usuario nao encontrado."; break; }
      }

      let stepFailed = false;
      switch (step.action_type) {
        case "create_task": {
          const { data: inserted, error: insertError } = await supabase.from("tasks").insert({
            tenant_id: user.tenantId,
            title: str(cfg, "title") ?? step.name,
            description: str(cfg, "description") ?? null,
            case_id: cfgCaseId ?? null,
            client_id: cfgClientId ?? null,
            assigned_to: cfgAssignedTo ?? null,
            status: "todo",
            priority: num(cfg, "priority") ?? 3,
            due_date: str(cfg, "due_date") ? new Date(str(cfg, "due_date")!).toISOString() : null,
            billable: false,
            created_by: user.id,
          }).select("id").single();
          if (insertError) { console.error("[workflows] task insert failed", { error: insertError.message }); lastError = "Erro ao criar tarefa"; stepFailed = true; break; }
          if (inserted?.id) createdResources.push({ table: "tasks", id: inserted.id });
          break;
        }
        case "create_deadline": {
          const due = str(cfg, "due_date");
          const { data: inserted, error: insertError } = await supabase.from("deadlines").insert({
            tenant_id: user.tenantId,
            case_id: cfgCaseId ?? null,
            title: str(cfg, "title") ?? step.name,
            due_date: due ? new Date(due).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString(),
            priority: num(cfg, "priority") ?? 2,
          }).select("id").single();
          if (insertError) { console.error("[workflows] deadline insert failed", { error: insertError.message }); lastError = "Erro ao criar prazo"; stepFailed = true; break; }
          if (inserted?.id) createdResources.push({ table: "deadlines", id: inserted.id });
          break;
        }
        case "create_event": {
          const { data: inserted, error: insertError } = await supabase.from("case_events").insert({
            tenant_id: user.tenantId,
            case_id: cfgCaseId ?? null,
            event_type: str(cfg, "event_type") ?? "workflow_event",
            description: str(cfg, "description") ?? step.name,
            created_by: user.id,
          }).select("id").single();
          if (insertError) { console.error("[workflows] event insert failed", { error: insertError.message }); lastError = "Erro ao criar evento"; stepFailed = true; break; }
          if (inserted?.id) createdResources.push({ table: "case_events", id: inserted.id });
          break;
        }
        case "create_invoice": {
          const amount = num(cfg, "amount_cents") ?? num(cfg, "amount") ?? 0;
          const { data: inserted, error: insertError } = await supabase.from("honorarios").insert({
            tenant_id: user.tenantId,
            client_id: cfgClientId ?? null,
            case_id: cfgCaseId ?? null,
            description: str(cfg, "description") ?? step.name,
            type: str(cfg, "type") ?? "fee",
            amount_cents: amount,
            status: str(cfg, "status") ?? "pending",
            due_date: str(cfg, "due_date") ?? null,
            installments: num(cfg, "installments") ?? 1,
            notes: str(cfg, "notes") ?? null,
          }).select("id").single();
          if (insertError) { console.error("[workflows] invoice insert failed", { error: insertError.message }); lastError = "Erro ao criar fatura"; stepFailed = true; break; }
          if (inserted?.id) createdResources.push({ table: "honorarios", id: inserted.id });
          break;
        }
        case "send_message": {
          const { data: inserted, error: insertError } = await supabase.from("communications_log").insert({
            tenant_id: user.tenantId,
            case_id: cfgCaseId ?? null,
            client_id: cfgClientId ?? null,
            channel: str(cfg, "channel") ?? "internal",
            direction: str(cfg, "direction") ?? "outbound",
            message_body: str(cfg, "message_body") ?? step.name,
            status: "sent",
          }).select("id").single();
          if (insertError) { console.error("[workflows] message insert failed", { error: insertError.message }); lastError = "Erro ao enviar mensagem"; stepFailed = true; break; }
          if (inserted?.id) createdResources.push({ table: "communications_log", id: inserted.id });
          break;
        }
        // Actions not yet implemented — record as skipped with a note.
        case "send_email":
        case "send_whatsapp":
        case "create_document":
        case "create_hearing":
        case "update_case":
          lastError = `Acao '${step.action_type}' ainda nao implementada — passo pulado.`;
          break;
      }

      // If an insert error occurred during this step, break out and roll back.
      if (stepFailed) {
        break;
      }

      completed += 1;
      if (execId) {
        await supabase
          .from("workflow_executions")
          .update({ steps_completed: completed })
          .eq("id", execId)
          .eq("tenant_id", user.tenantId);
      }
    } catch (err) {
      console.error("[workflows] execution error", { error: err instanceof Error ? err.message : String(err) });
      lastError = "Erro inesperado na execução";
      break;
    }
  }

  // Compensating action: if the workflow failed, roll back created resources.
  if (lastError && createdResources.length > 0) {
    console.error(`[WORKFLOWS] Execution failed (${lastError}), rolling back ${createdResources.length} created resource(s):`);
    for (const res of createdResources.reverse()) {
      const { error: deleteError } = await supabase
        .from(res.table)
        .delete()
        .eq("id", res.id)
        .eq("tenant_id", user.tenantId);
      if (deleteError) {
        console.error(`[WORKFLOWS] CRITICAL: Failed to delete orphaned ${res.table} ${res.id} — manual cleanup required:`, deleteError.message);
      } else {
        console.error(`[WORKFLOWS] Rolled back ${res.table} ${res.id}`);
      }
    }
  }

  // Finalize the execution record.
  if (execId) {
    await supabase
      .from("workflow_executions")
      .update({
        status: lastError ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        steps_completed: completed,
        error: lastError,
      })
      .eq("id", execId)
      .eq("tenant_id", user.tenantId);
  }

  return c.redirect(`/workflows/${id}`);
});

// POST /workflows/:id/toggle -- toggle active status.
workflowsRoutes.post("/:id/toggle", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: wf } = await supabase
    .from("workflows")
    .select("active")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!wf) return c.redirect("/workflows");

  await supabase
    .from("workflows")
    .update({ active: !wf.active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/workflows/${id}`);
});

// POST /workflows/:id -- update workflow.
workflowsRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = workflowSchema.safeParse(body);

  if (!parsed.success) return c.redirect(`/workflows/${id}`);

  await supabase
    .from("workflows")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      trigger_type: parsed.data.trigger_type,
      active: parsed.data.active === "1",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/workflows/${id}`);
});

// POST /workflows/:id/delete -- soft delete.
workflowsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("workflows")
    .update({ deleted_at: new Date().toISOString(), active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/workflows");
});
