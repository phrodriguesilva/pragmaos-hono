import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const tasksRoutes = new Hono<AppEnv>();

tasksRoutes.use("*", requireAuth);

const taskSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  description: z.string().optional(),
  case_id: z.string().uuid().optional().or(z.literal("")),
  client_id: z.string().uuid().optional().or(z.literal("")),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["todo", "in_progress", "review", "done"]),
  priority: z.coerce.number().int().min(1).max(5),
  due_date: z.string().optional(),
  billable: z.string().optional(),
});

const COLUMNS = [
  { key: "todo", label: "A Fazer", color: "gray" as const, icon: "ph-circle" },
  { key: "in_progress", label: "Em Andamento", color: "blue" as const, icon: "ph-circle-half" },
  { key: "review", label: "Revisao", color: "yellow" as const, icon: "ph-circle-notch" },
  { key: "done", label: "Concluido", color: "green" as const, icon: "ph-check-circle" },
];

// GET /tasks -- Kanban view + list toggle.
tasksRoutes.get("/", async (c) => {
  const user = c.get("user");
  const view = c.req.query("view") ?? "kanban";
  const mine = c.req.query("mine") === "1";

  let query = supabase
    .from("tasks")
    .select("id, title, description, status, priority, due_date, case_id, client_id, assigned_to, billable, time_spent_minutes, cases(title), clients(name), profiles(full_name)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("priority", { ascending: false });

  if (mine) query = query.eq("assigned_to", user.id);

  const [tasksRes, casesRes, clientsRes, usersRes] = await Promise.all([
    query,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("profiles").select("id, full_name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("full_name"),
  ]);

  const tasks = tasksRes.data;
  const caseOptions = [{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))];
  const clientOptions = [{ value: "", label: "Nenhum" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))];
  const userOptions = [{ value: "", label: "Sem responsavel" }, ...(usersRes.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))];

  const newTaskModal = (
    <Modal
      id="new-task"
      title="Nova Tarefa"
      icon="ph-check-square"
      triggerText="Nova Tarefa"
      triggerIcon="ph-plus"
      action="/tasks"
      large
    >
      <TextField label="Titulo" id="title" name="title" required placeholder="Descricao da tarefa" icon="ph-text-aa" />
      <Textarea label="Descricao" id="description" name="description" rows={3} />
      <div class="grid grid-cols-2 gap-4">
        <ComboBox label="Processo (opcional)" id="case_id" name="case_id" icon="ph-folder"
          options={caseOptions}
        />
        <ComboBox label="Cliente (opcional)" id="client_id" name="client_id" icon="ph-users"
          options={clientOptions}
        />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <ComboBox label="Responsavel" id="assigned_to" name="assigned_to" icon="ph-user-circle"
          options={userOptions}
        />
        <Select label="Prioridade" id="priority" name="priority" required selected="3" icon="ph-flag"
          options={[1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: `P${p}` }))}
        />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <Select label="Status" id="status" name="status" required selected="todo" icon="ph-circle-half"
          options={COLUMNS.map((c2) => ({ value: c2.key, label: c2.label }))}
        />
        <TextField label="Prazo" id="due_date" name="due_date" type="date" icon="ph-calendar" />
      </div>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="billable" name="billable" value="1" class="w-4 h-4" />
        <label for="billable" class="text-body-sm text-gray-700">Hora faturavel</label>
      </div>
    </Modal>
  );

  if (view === "list") {
    const rows = (tasks ?? []).map((t) => {
      const col = COLUMNS.find((c2) => c2.key === t.status);
      const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== "done";
      return [
        <a href={`/tasks/${t.id}`} class="text-terracota-600 hover:underline">{t.title}</a> as unknown as string,
        (t.cases as unknown as { title: string } | null)?.title ?? "-",
        (t.profiles as unknown as { full_name: string } | null)?.full_name ?? "-",
        `P${t.priority}`,
        t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "-",
        <Badge color={overdue ? "red" : col?.color ?? "gray"} icon={col?.icon}>{col?.label ?? t.status}</Badge> as unknown as string,
      ];
    });

    return renderPage(
      c,
      { title: "Tarefas", active: "tasks" },
      <>
        <PageHeader
          title="Tarefas"
          icon="ph-check-square"
          actions={() => (
            <div class="flex gap-2">
              <a href="/tasks?view=kanban" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-kanban" aria-hidden="true" />Kanban
              </a>
              <a href="/tasks?view=list" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-list" aria-hidden="true" />Lista
              </a>
              <a href="/tasks?mine=1" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-user" aria-hidden="true" />Minhas
              </a>
              {newTaskModal}
            </div>
          )}
        />
        <Table
          columns={[
            { label: "Titulo", icon: "ph-text-aa" },
            { label: "Processo", icon: "ph-folder" },
            { label: "Responsavel", icon: "ph-user-circle" },
            { label: "Prioridade", icon: "ph-flag" },
            { label: "Prazo", icon: "ph-calendar" },
            { label: "Status", icon: "ph-circle-half" },
          ]}
          rows={rows}
          emptyMsg="Nenhuma tarefa."
          emptyIcon="ph-check-square"
          ariaLabel="Lista de tarefas"
        />
      </>,
    );
  }

  // Kanban view.
  const byCol = (col: string) => (tasks ?? []).filter((t) => t.status === col);

  return renderPage(
    c,
    { title: "Tarefas", active: "tasks" },
    <>
      <PageHeader
        title="Tarefas - Kanban"
        icon="ph-check-square"
        actions={() => (
          <div class="flex gap-2">
            <a href="/tasks?view=kanban" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-kanban" aria-hidden="true" />Kanban
            </a>
            <a href="/tasks?view=list" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-list" aria-hidden="true" />Lista
            </a>
            <a href="/tasks?mine=1" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-user" aria-hidden="true" />Minhas
            </a>
            {newTaskModal}
          </div>
        )}
      />
      <div class="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colTasks = byCol(col.key);
          return (
            <div class="w-64 shrink-0">
              <div class="flex items-center gap-2 mb-2 px-2 py-1 bg-gray-100 border border-border-strong">
                <i class={`ph ${col.icon} text-body text-gray-600`} aria-hidden="true" />
                <span class="text-body-sm font-semibold text-gray-700">{col.label}</span>
                <span class="text-body-sm text-gray-400 ml-auto">{colTasks.length}</span>
              </div>
              <div class="flex flex-col gap-2">
                {colTasks.map((t) => {
                  const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== "done";
                  const assigned = (t.profiles as unknown as { full_name: string } | null)?.full_name;
                  const caseTitle = (t.cases as unknown as { title: string } | null)?.title;
                  return (
                    <a href={`/tasks/${t.id}`} class="block border border-border bg-white p-2 hover:border-carvao-400 hover:shadow-sm">
                      <div class="flex items-start justify-between gap-1">
                        <span class="text-body-sm font-semibold text-gray-800">{t.title}</span>
                        <span class={`text-body-sm font-bold ${t.priority >= 4 ? "text-status-red" : t.priority >= 3 ? "text-status-yellow" : "text-gray-400"}`}>P{t.priority}</span>
                      </div>
                      {caseTitle ? <div class="text-body-sm text-carvao-600 mt-1 flex items-center gap-1"><i class="ph ph-folder text-xs" aria-hidden="true" />{caseTitle}</div> : null}
                      {t.due_date ? (
                        <div class={`text-body-sm mt-1 flex items-center gap-1 ${overdue ? "text-status-red font-semibold" : "text-gray-500"}`}>
                          <i class="ph ph-calendar text-xs" aria-hidden="true" />
                          {new Date(t.due_date).toLocaleDateString("pt-BR")}
                        </div>
                      ) : null}
                      {assigned ? (
                        <div class="text-body-sm text-gray-400 mt-1 flex items-center gap-1">
                          <i class="ph ph-user-circle text-xs" aria-hidden="true" />
                          {assigned}
                        </div>
                      ) : null}
                    </a>
                  );
                })}
                {colTasks.length === 0 ? (
                  <div class="text-body-sm text-gray-300 text-center py-4 border border-dashed border-border">
                    <i class="ph ph-inbox text-h2 block mb-1" aria-hidden="true" />
                    Vazio
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>,
  );
});

// POST /tasks -- create.
tasksRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = taskSchema.safeParse(body);

  if (!parsed.success) return c.redirect("/tasks");

  await supabase.from("tasks").insert({
    tenant_id: user.tenantId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    assigned_to: parsed.data.assigned_to || null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date ? new Date(parsed.data.due_date).toISOString() : null,
    billable: parsed.data.billable === "1",
    created_by: user.id,
  });

  return c.redirect("/tasks");
});

// GET /tasks/:id -- detail.
tasksRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: task } = await supabase
    .from("tasks")
    .select("*, cases(title), clients(name), profiles(full_name)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!task) return c.html("Tarefa nao encontrada.", 404);

  const [casesRes, clientsRes, usersRes] = await Promise.all([
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("profiles").select("id, full_name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("full_name"),
  ]);

  const col = COLUMNS.find((c2) => c2.key === task.status);
  const caseTitle = (task.cases as unknown as { title: string } | null)?.title;
  const clientName = (task.clients as unknown as { name: string } | null)?.name;
  const assignedName = (task.profiles as unknown as { full_name: string } | null)?.full_name;

  const caseOptions = [{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))];
  const clientOptions = [{ value: "", label: "Nenhum" }, ...(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))];
  const userOptions = [{ value: "", label: "Sem responsavel" }, ...(usersRes.data ?? []).map((u) => ({ value: u.id, label: u.full_name }))];

  return renderPage(
    c,
    { title: task.title, active: "tasks" },
    <>
      <PageHeader
        title={task.title}
        icon="ph-check-square"
        actions={() => (
          <div class="flex gap-2">
            <Modal
              id="edit-task"
              title={`Editar ${task.title}`}
              icon="ph-pencil"
              triggerText="Editar"
              triggerIcon="ph-pencil"
              triggerVariant="secondary"
              action={`/tasks/${id}`}
              large
            >
              <TextField label="Titulo" id="title" name="title" required value={task.title} icon="ph-text-aa" />
              <Textarea label="Descricao" id="description" name="description" rows={3}>{task.description ?? ""}</Textarea>
              <div class="grid grid-cols-2 gap-4">
                <Select label="Processo (opcional)" id="case_id" name="case_id" icon="ph-folder" selected={task.case_id ?? ""}
                  options={caseOptions}
                />
                <Select label="Cliente (opcional)" id="client_id" name="client_id" icon="ph-users" selected={task.client_id ?? ""}
                  options={clientOptions}
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <Select label="Responsavel" id="assigned_to" name="assigned_to" icon="ph-user-circle" selected={task.assigned_to ?? ""}
                  options={userOptions}
                />
                <Select label="Prioridade" id="priority" name="priority" required selected={String(task.priority)} icon="ph-flag"
                  options={[1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: `P${p}` }))}
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <Select label="Status" id="status" name="status" required selected={task.status} icon="ph-circle-half"
                  options={COLUMNS.map((c2) => ({ value: c2.key, label: c2.label }))}
                />
                <TextField label="Prazo" id="due_date" name="due_date" type="date" icon="ph-calendar"
                  value={task.due_date ? new Date(task.due_date).toISOString().split("T")[0] : ""}
                />
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" id="billable" name="billable" value="1" class="w-4 h-4" checked={task.billable} />
                <label for="billable" class="text-body-sm text-gray-700">Hora faturavel</label>
              </div>
            </Modal>
            <form method="post" action={`/tasks/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta tarefa?')">
                <i class="ph ph-trash" aria-hidden="true" />Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados da tarefa" icon="ph-check-square">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={col?.color ?? "gray"} icon={col?.icon}>{col?.label}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Prioridade: </dt><dd class="inline">P{task.priority}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Responsavel: </dt><dd class="inline">{assignedName ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Prazo: </dt><dd class="inline">{task.due_date ? new Date(task.due_date).toLocaleDateString("pt-BR") : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{caseTitle ? <a href={`/cases/${task.case_id}`} class="text-terracota-600 hover:underline">{caseTitle}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline">{clientName ?? "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Faturavel: </dt><dd class="inline">{task.billable ? "Sim" : "Nao"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tempo gasto: </dt><dd class="inline">{Math.floor(task.time_spent_minutes / 60)}h {task.time_spent_minutes % 60}min</dd></div>
          </dl>
        </Panel>
        {task.description ? (
          <Panel title="Descricao" icon="ph-text-aa">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
          </Panel>
        ) : null}
      </div>

      {/* Status change */}
      <Panel title="Mover para coluna" icon="ph-arrows-left-right">
        <form method="post" action={`/tasks/${id}/status`} class="flex gap-2 items-end">
          <Select label="Status" id="status" name="status" required selected={task.status}
            options={COLUMNS.map((c2) => ({ value: c2.key, label: c2.label }))}
          />
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-arrows-right-left" aria-hidden="true" />Mover
          </button>
        </form>
      </Panel>
    </>,
  );
});

// POST /tasks/:id/status -- change status.
tasksRoutes.post("/:id/status", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const status = String(body.status ?? "");

  const valid = COLUMNS.some((c2) => c2.key === status);
  if (!valid) return c.redirect(`/tasks/${id}`);

  await supabase.from("tasks").update({ status }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect(`/tasks/${id}`);
});

// POST /tasks/:id -- update.
tasksRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = taskSchema.safeParse(body);

  if (!parsed.success) return c.redirect(`/tasks/${id}`);

  await supabase.from("tasks").update({
    title: parsed.data.title,
    description: parsed.data.description || null,
    case_id: parsed.data.case_id || null,
    client_id: parsed.data.client_id || null,
    assigned_to: parsed.data.assigned_to || null,
    status: parsed.data.status,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date ? new Date(parsed.data.due_date).toISOString() : null,
    billable: parsed.data.billable === "1",
  }).eq("id", id).eq("tenant_id", user.tenantId);

  return c.redirect(`/tasks/${id}`);
});

// POST /tasks/:id/delete -- soft delete.
tasksRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/tasks");
});
