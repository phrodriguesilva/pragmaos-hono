import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const timesheetRoutes = new Hono<AppEnv>();

timesheetRoutes.use("*", requireAuth);

const entrySchema = z.object({
  description: z.string().min(1, "Descricao e obrigatorio"),
  case_id: z.string().uuid().optional().or(z.literal("")),
  task_id: z.string().uuid().optional().or(z.literal("")),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  billable: z.string().optional(),
  hourly_rate_cents: z.string().optional(),
});

// Format minutes as "Xh Ymin".
function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// Format cents as BRL currency string.
function formatBRL(cents: number | null | undefined): string {
  if (!cents) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

// Convert a datetime-local string to ISO (for storage).
function toISO(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Convert an ISO timestamp to a datetime-local string (for form values).
function toLocalInput(iso?: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Calculate duration in minutes between two ISO timestamps.
function durationMinutes(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return null;
  return Math.round((e - s) / 60000);
}

// GET /timesheet -- list time entries for the current user (default) or all users (?all=1).
timesheetRoutes.get("/", async (c) => {
  const user = c.get("user");
  const all = c.req.query("all") === "1";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  const queryParams: Record<string, string> = {};
  if (all) queryParams.all = "1";

  let query = supabase
    .from("time_entries")
    .select("id, description, start_time, end_time, duration_minutes, billable, invoiced, user_id, case_id, task_id, cases(title), tasks(title), profiles!time_entries_user_id_fkey(full_name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("start_time", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (!all) query = query.eq("user_id", user.id);

  const { data: entries, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  // Fetch cases and tasks for the modal selects.
  const [casesRes, tasksRes] = await Promise.all([
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("tasks").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const rows = (entries ?? []).map((e) => {
    const caseTitle = (e.cases as unknown as { title: string } | null)?.title;
    const taskTitle = (e.tasks as unknown as { title: string } | null)?.title;
    const userName = (e.profiles as unknown as { full_name: string } | null)?.full_name ?? "-";
    return [
      e.start_time ? new Date(e.start_time).toLocaleDateString("pt-BR") : "-",
      all ? userName : "-",
      <a href={`/timesheet/${e.id}`} class="text-[#0568ff] hover:underline">{e.description}</a> as unknown as string,
      caseTitle ?? "-",
      taskTitle ?? "-",
      formatDuration(e.duration_minutes),
      e.billable
        ? (<Badge color="green" icon="ph-currency-circle-dollar">Sim</Badge> as unknown as string)
        : (<Badge color="gray" icon="ph-x-circle">Nao</Badge> as unknown as string),
      e.invoiced
        ? (<Badge color="blue" icon="ph-invoice">Faturado</Badge> as unknown as string)
        : (<Badge color="yellow" icon="ph-clock">Pendente</Badge> as unknown as string),
      <a href={`/timesheet/${e.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Timesheet", active: "timesheet" },
    <>
      <PageHeader
        title="Timesheet"
        icon="ph-timer"
        actions={() => (
          <div class="flex gap-2">
            <a href="/timesheet" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-user" aria-hidden="true" />Meu Timesheet
            </a>
            <a href="/timesheet?all=1" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-users" aria-hidden="true" />Toda equipe
            </a>
            <a href="/timesheet/summary" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-chart-bar" aria-hidden="true" />Resumo
            </a>
            <Modal id="new-timesheet" title="Registrar Tempo" icon="ph-timer" triggerText="Registrar Tempo" triggerIcon="ph-plus" action="/timesheet" submitLabel="Salvar" large>
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id" icon="ph-folder"
                options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
              />
              <ComboBox label="Tarefa (opcional)" id="task_id" name="task_id" icon="ph-check-square"
                options={[{ value: "", label: "Nenhuma" }, ...(tasksRes.data ?? []).map((t) => ({ value: t.id, label: t.title }))]}
              />
              <TextField label="Descricao" id="description" name="description" required placeholder="O que foi feito..." icon="ph-text-aa" />
              <TextField label="Inicio" id="start_time" name="start_time" type="datetime-local" icon="ph-play" />
              <TextField label="Duracao (minutos)" id="duration_minutes" name="duration_minutes" type="number" placeholder="0" icon="ph-timer" />
              <div class="grid grid-cols-2 gap-4 items-end">
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="billable" name="billable" value="1" class="w-4 h-4" />
                  <label for="billable" class="text-body-sm text-gray-700">Hora faturavel</label>
                </div>
                <TextField label="Valor/hora" id="hourly_rate_cents" name="hourly_rate_cents" type="number" step="0.01" placeholder="R$/hora" icon="ph-currency-dollar" />
              </div>
            </Modal>
          </div>
        )}
      />
      <Table
        columns={[
          { label: "Data", icon: "ph-calendar" },
          { label: "Usuario", icon: "ph-user-circle" },
          { label: "Descricao", icon: "ph-text-aa" },
          { label: "Processo", icon: "ph-folder" },
          { label: "Tarefa", icon: "ph-check-square" },
          { label: "Duracao", icon: "ph-timer" },
          { label: "Faturavel", icon: "ph-currency-circle-dollar" },
          { label: "Faturado", icon: "ph-invoice" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhum registro de tempo."
        emptyIcon="ph-timer"
        ariaLabel="Lista de registros de tempo"
        count={count ?? 0}
        countLabel="registro(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/timesheet",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /timesheet -- create.
timesheetRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = entrySchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return renderPage(
      c,
      { title: "Novo Registro", active: "timesheet" },
      <>
        <PageHeader title="Novo Registro" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red">
            <i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>
            {Object.values(errors).flat().join(", ")}
          </div>
          <a href="/timesheet" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  const startISO = toISO(parsed.data.start_time);
  const endISO = toISO(parsed.data.end_time);
  const duration = durationMinutes(startISO, endISO);

  const rateRaw = parsed.data.hourly_rate_cents ? parseFloat(parsed.data.hourly_rate_cents) : NaN;
  const rateCents = isNaN(rateRaw) ? null : Math.round(rateRaw * 100);

  const { error } = await supabase.from("time_entries").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    description: parsed.data.description,
    case_id: parsed.data.case_id || null,
    task_id: parsed.data.task_id || null,
    start_time: startISO,
    end_time: endISO,
    duration_minutes: duration,
    billable: parsed.data.billable === "1",
    hourly_rate_cents: rateCents,
    invoiced: false,
  });

  if (error) {
    return renderPage(
      c,
      { title: "Novo Registro", active: "timesheet" },
      <>
        <PageHeader title="Novo Registro" icon="ph-plus-circle" />
        <Panel>
          <div class="mb-4 text-status-red"><i class="ph ph-warning text-h2 block mb-2 text-status-red" aria-hidden="true"></i>Erro ao salvar: {error.message}</div>
          <a href="/timesheet" class="btn btn-secondary">Voltar</a>
        </Panel>
      </>,
    );
  }

  return c.redirect("/timesheet");
});

// GET /timesheet/summary -- summary report: total hours per user, billable hours, billable amount.
// MUST be registered before /:id to avoid route shadowing.
timesheetRoutes.get("/summary", async (c) => {
  const user = c.get("user");

  const { data: entries } = await supabase
    .from("time_entries")
    .select("id, user_id, duration_minutes, billable, hourly_rate_cents, profiles!time_entries_user_id_fkey(full_name)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null);

  const all = entries ?? [];

  const byUser = new Map<string, { full_name: string; totalMinutes: number; billableMinutes: number; billableAmountCents: number }>();
  let totalMinutes = 0;
  let totalBillableMinutes = 0;
  let totalBillableAmountCents = 0;

  for (const e of all) {
    const minutes = e.duration_minutes ?? 0;
    const userName = (e.profiles as unknown as { full_name: string } | null)?.full_name ?? "Desconhecido";
    const key = e.user_id;
    if (!byUser.has(key)) {
      byUser.set(key, { full_name: userName, totalMinutes: 0, billableMinutes: 0, billableAmountCents: 0 });
    }
    const agg = byUser.get(key)!;
    agg.totalMinutes += minutes;
    totalMinutes += minutes;
    if (e.billable) {
      agg.billableMinutes += minutes;
      totalBillableMinutes += minutes;
      const rate = e.hourly_rate_cents ?? 0;
      const amount = Math.round((minutes / 60) * rate);
      agg.billableAmountCents += amount;
      totalBillableAmountCents += amount;
    }
  }

  const userRows = [...byUser.values()].map((u) => [
    u.full_name,
    formatDuration(u.totalMinutes),
    formatDuration(u.billableMinutes),
    formatBRL(u.billableAmountCents),
  ]);

  return renderPage(
    c,
    { title: "Resumo de Horas", active: "timesheet" },
    <>
      <PageHeader
        title="Resumo de Horas"
        icon="ph-chart-bar"
        actions={() => (
          <div class="flex gap-2">
            <a href="/timesheet" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-arrow-left" aria-hidden="true" />Voltar
            </a>
          </div>
        )}
      />
      <div class="grid grid-cols-3 gap-4 mb-6">
        <Panel title="Total de Horas" icon="ph-timer">
          <div class="text-h1 font-bold text-[#0568ff]">{formatDuration(totalMinutes)}</div>
          <div class="text-body-sm text-gray-500 mt-1">Todas as entradas</div>
        </Panel>
        <Panel title="Horas Faturaveis" icon="ph-currency-circle-dollar">
          <div class="text-h1 font-bold text-green-600">{formatDuration(totalBillableMinutes)}</div>
          <div class="text-body-sm text-gray-500 mt-1">Horas faturaveis</div>
        </Panel>
        <Panel title="Valor Faturavel" icon="ph-currency-dollar">
          <div class="text-h1 font-bold text-green-700">{formatBRL(totalBillableAmountCents)}</div>
          <div class="text-body-sm text-gray-500 mt-1">Total a faturar</div>
        </Panel>
      </div>
      <Panel title="Por Usuario" icon="ph-users">
        <Table
          columns={[
            { label: "Usuario", icon: "ph-user-circle" },
            { label: "Total", icon: "ph-timer" },
            { label: "Faturavel", icon: "ph-currency-circle-dollar" },
            { label: "Valor", icon: "ph-currency-dollar" },
          ]}
          rows={userRows}
          emptyMsg="Nenhum registro encontrado."
          emptyIcon="ph-timer"
          ariaLabel="Resumo por usuario"
        />
      </Panel>
    </>,
  );
});

// GET /timesheet/:id -- detail.
timesheetRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: entry } = await supabase
    .from("time_entries")
    .select("*, cases(title), tasks(title), profiles!time_entries_user_id_fkey(full_name)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!entry) return c.html("Registro nao encontrado.", 404);

  const [casesRes, tasksRes] = await Promise.all([
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("tasks").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const caseTitle = (entry.cases as unknown as { title: string } | null)?.title;
  const taskTitle = (entry.tasks as unknown as { title: string } | null)?.title;
  const userName = (entry.profiles as unknown as { full_name: string } | null)?.full_name ?? "-";

  const rateValue = entry.hourly_rate_cents ? (entry.hourly_rate_cents / 100).toFixed(2) : "";

  return renderPage(
    c,
    { title: entry.description, active: "timesheet" },
    <>
      <PageHeader
        title={entry.description}
        icon="ph-timer"
        actions={() => (
          <div class="flex gap-2">
            <Modal id="edit-timesheet" title="Editar" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/timesheet/${id}`} submitLabel="Salvar" large>
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id" icon="ph-folder" selected={entry.case_id ?? ""}
                options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
              />
              <ComboBox label="Tarefa (opcional)" id="task_id" name="task_id" icon="ph-check-square" selected={entry.task_id ?? ""}
                options={[{ value: "", label: "Nenhuma" }, ...(tasksRes.data ?? []).map((t) => ({ value: t.id, label: t.title }))]}
              />
              <TextField label="Descricao" id="description" name="description" required value={entry.description} icon="ph-text-aa" />
              <TextField label="Inicio" id="start_time" name="start_time" type="datetime-local" icon="ph-play"
                value={toLocalInput(entry.start_time)}
              />
              <TextField label="Duracao (minutos)" id="duration_minutes" name="duration_minutes" type="number" placeholder="0" icon="ph-timer"
                value={entry.duration_minutes ? String(entry.duration_minutes) : ""}
              />
              <div class="grid grid-cols-2 gap-4 items-end">
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="billable" name="billable" value="1" class="w-4 h-4" checked={entry.billable} />
                  <label for="billable" class="text-body-sm text-gray-700">Hora faturavel</label>
                </div>
                <TextField label="Valor/hora" id="hourly_rate_cents" name="hourly_rate_cents" type="number" step="0.01" placeholder="R$/hora" icon="ph-currency-dollar" value={rateValue} />
              </div>
            </Modal>
            <form method="post" action={`/timesheet/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este registro?')" aria-label="Excluir">
                <i class="ph ph-trash" aria-hidden="true" />Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Dados do registro" icon="ph-timer">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Descricao: </dt><dd class="inline">{entry.description}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Usuario: </dt><dd class="inline">{userName}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{caseTitle ? <a href={`/cases/${entry.case_id}`} class="text-[#0568ff] hover:underline">{caseTitle}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tarefa: </dt><dd class="inline">{taskTitle ? <a href={`/tasks/${entry.task_id}`} class="text-[#0568ff] hover:underline">{taskTitle}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Inicio: </dt><dd class="inline">{entry.start_time ? new Date(entry.start_time).toLocaleString("pt-BR") : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Fim: </dt><dd class="inline">{entry.end_time ? new Date(entry.end_time).toLocaleString("pt-BR") : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Duracao: </dt><dd class="inline">{formatDuration(entry.duration_minutes)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Faturavel: </dt><dd class="inline">{entry.billable ? "Sim" : "Nao"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor/hora: </dt><dd class="inline">{formatBRL(entry.hourly_rate_cents)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Faturado: </dt><dd class="inline">{entry.invoiced ? "Sim" : "Nao"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "-"}</dd></div>
          </dl>
        </Panel>
      </div>
    </>,
  );
});

// POST /timesheet/:id -- update.
timesheetRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = entrySchema.safeParse(body);

  if (!parsed.success) return c.redirect(`/timesheet/${id}`);

  const startISO = toISO(parsed.data.start_time);
  const endISO = toISO(parsed.data.end_time);
  const duration = durationMinutes(startISO, endISO);

  const rateRaw = parsed.data.hourly_rate_cents ? parseFloat(parsed.data.hourly_rate_cents) : NaN;
  const rateCents = isNaN(rateRaw) ? null : Math.round(rateRaw * 100);

  await supabase.from("time_entries").update({
    description: parsed.data.description,
    case_id: parsed.data.case_id || null,
    task_id: parsed.data.task_id || null,
    start_time: startISO,
    end_time: endISO,
    duration_minutes: duration,
    billable: parsed.data.billable === "1",
    hourly_rate_cents: rateCents,
  }).eq("id", id).eq("tenant_id", user.tenantId);

  return c.redirect(`/timesheet/${id}`);
});

// POST /timesheet/:id/delete -- soft delete.
timesheetRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("time_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/timesheet");
});

export default timesheetRoutes;
