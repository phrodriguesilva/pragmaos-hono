import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { setFlash } from "../lib/flash";
import { caseBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, ComboBox, Badge, Modal } from "../components/ui";

export const deadlinesRoutes = new Hono<AppEnv>();

deadlinesRoutes.use("*", requireAuth);

const deadlineSchema = z.object({
  case_id: z.string().uuid("Processo invalido"),
  title: z.string().min(1, "Titulo e obrigatorio"),
  due_date: z.string().min(1, "Data e obrigatoria"),
  priority: z.coerce.number().int().min(1).max(5),
});

// GET /deadlines -- list all open deadlines, sorted by due_date.
deadlinesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const showAll = c.req.query("all") === "1";

  const queryParams: Record<string, string> = {};
  if (showAll) queryParams.all = "1";

  let query = supabase
    .from("deadlines")
    .select("id, title, due_date, priority, completed_at, case_id, cases(title)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });

  if (!showAll) query = query.is("completed_at", null);

  query = query.range(offset, offset + limit - 1);

  const [deadlinesRes, casesRes] = await Promise.all([
    query,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const deadlines = deadlinesRes.data;
  const count = deadlinesRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const caseOptions = (casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }));
  const now = new Date();

  const rows = (deadlines ?? []).map((d) => {
    const due = new Date(d.due_date);
    const overdue = due < now && !d.completed_at;
    return [
      <a href={`/cases/${d.case_id}`} class="text-[#0568ff] hover:underline">{(d.cases as unknown as { title: string } | null)?.title ?? "-"}</a> as unknown as string,
      d.title,
      new Date(d.due_date).toLocaleDateString("pt-BR"),
      `P${d.priority}`,
      d.completed_at
        ? <Badge color="gray">Concluido</Badge>
        : overdue
          ? <Badge color="red">Atrasado</Badge>
          : <Badge color="yellow">Pendente</Badge> as unknown as string,
      d.completed_at ? null : (
        <div class="flex items-center gap-2">
          <a href={`/deadlines/${d.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
          <a href={`/deadlines/${d.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
          <form method="post" action={`/deadlines/${d.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
          <form method="post" action={`/deadlines/${d.id}/complete`} class="inline">
            <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-check" aria-hidden="true"></i>Concluir</button>
          </form>
        </div>
      ) as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Prazos", active: "deadlines" },
    <>
      <PageHeader
        title="Prazos"
        icon="ph-clock-countdown"
        actions={() => (
          <Modal
            id="new-deadline"
            title="Novo Prazo"
            icon="ph-clock-countdown"
            triggerText="Novo Prazo"
            triggerIcon="ph-plus"
            action="/deadlines"
            large
          >
            <ComboBox label="Processo" id="case_id" name="case_id" required
              options={caseOptions}
            />
            <TextField label="Titulo" id="title" name="title" required placeholder="Descricao do prazo" />
            <TextField label="Data limite" id="due_date" name="due_date" type="date" required />
            <Select label="Prioridade" id="priority" name="priority" required selected="3"
              options={[1, 2, 3, 4, 5].map((p) => ({ value: String(p), label: `P${p}` }))}
            />
          </Modal>
        )}
      />
      <div class="mb-4 flex gap-2">
        <a href="/deadlines" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-clock" aria-hidden="true"></i>Pendentes</a>
        <a href="/deadlines?all=1" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-list" aria-hidden="true"></i>Todos</a>
      </div>
      <Table
        columns={[{ label: "Processo" }, { label: "Prazo" }, { label: "Data" }, { label: "Prioridade" }, { label: "Status" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhum prazo."
        emptyIcon="ph-check-circle"
        ariaLabel="Lista de prazos"
        count={count ?? 0}
        countLabel="prazo(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/deadlines",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// GET /deadlines/new -- form to create a new deadline (supports pre-fill from prazos calculator).
deadlinesRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const dueDate = c.req.query("due_date") ?? "";
  const title = c.req.query("title") ?? "";
  const caseId = c.req.query("case_id") ?? "";

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  return renderPage(
    c,
    { title: "Novo Prazo", active: "deadlines" },
    <>
      <PageHeader title="Novo Prazo" icon="ph-clock-countdown" />
      <div class="max-w-xl">
        <form method="post" action="/deadlines" class="space-y-4 bg-white p-6 rounded-xl border border-gray-100">
          <Select label="Processo" id="case_id" name="case_id" required
            options={(cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }))}
            selected={caseId}
          />
          <TextField label="Titulo" id="title" name="title" required value={title} icon="ph-text-aa" />
          <TextField label="Data de vencimento" id="due_date" name="due_date" type="date" required value={dueDate} icon="ph-calendar" />
          <Select label="Prioridade" id="priority" name="priority"
            options={[
              { value: "1", label: "1 - Baixa" },
              { value: "2", label: "2" },
              { value: "3", label: "3 - Media" },
              { value: "4", label: "4" },
              { value: "5", label: "5 - Alta" },
            ]}
            selected="3"
          />
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn btn-primary">Salvar Prazo</button>
            <a href="/deadlines" class="btn btn-ghost">Cancelar</a>
          </div>
        </form>
      </div>
    </>,
  );
});

// GET /deadlines/:id -- view/edit a deadline.
deadlinesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: deadline } = await supabase
    .from("deadlines")
    .select("*, cases(title)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!deadline) return c.notFound();

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  const dueDateStr = deadline.due_date ? new Date(deadline.due_date).toISOString().split("T")[0] : "";

  return renderPage(
    c,
    { title: deadline.title, active: "deadlines" },
    <>
      <PageHeader title={deadline.title} icon="ph-clock-countdown" />
      <div class="max-w-xl">
        <form method="post" action={`/deadlines/${id}`} class="space-y-4 bg-white p-6 rounded-xl border border-gray-100">
          <Select label="Processo" id="case_id" name="case_id" required
            options={(cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }))}
            selected={deadline.case_id ?? ""}
          />
          <TextField label="Titulo" id="title" name="title" required value={deadline.title} icon="ph-text-aa" />
          <TextField label="Data de vencimento" id="due_date" name="due_date" type="date" required value={dueDateStr} icon="ph-calendar" />
          <Select label="Prioridade" id="priority" name="priority"
            options={[
              { value: "1", label: "1 - Baixa" },
              { value: "2", label: "2" },
              { value: "3", label: "3 - Media" },
              { value: "4", label: "4" },
              { value: "5", label: "5 - Alta" },
            ]}
            selected={String(deadline.priority ?? 3)}
          />
          <div class="flex gap-3 pt-2">
            <button type="submit" class="btn btn-primary">Salvar Alteracoes</button>
            <a href="/deadlines" class="btn btn-ghost">Voltar</a>
          </div>
        </form>
      </div>
    </>,
  );
});

// POST /deadlines/:id -- update.
deadlinesRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = deadlineSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/deadlines/${id}`);

  await supabase.from("deadlines").update({
    case_id: parsed.data.case_id,
    title: parsed.data.title,
    due_date: new Date(parsed.data.due_date).toISOString(),
    priority: parsed.data.priority,
  }).eq("id", id).eq("tenant_id", user.tenantId);

  setFlash(c, "success", "Prazo atualizado com sucesso!");
  return c.redirect("/deadlines");
});

// POST /deadlines -- create.
deadlinesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = deadlineSchema.safeParse(body);
  if (!parsed.success) {
    setFlash(c, "error", "Dados invalidos. Verifique os campos obrigatórios.");
    return c.redirect("/deadlines");
  }

  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  await supabase.from("deadlines").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id,
    title: parsed.data.title,
    due_date: new Date(parsed.data.due_date).toISOString(),
    priority: parsed.data.priority,
  });

  setFlash(c, "success", "Prazo criado com sucesso!");
  return c.redirect("/deadlines");
});

// POST /deadlines/:id/complete -- mark as completed.
deadlinesRoutes.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("deadlines").update({ completed_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  setFlash(c, "success", "Prazo concluido!");
  return c.redirect("/deadlines");
});

// POST /deadlines/:id/reopen -- reopen.
deadlinesRoutes.post("/:id/reopen", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("deadlines").update({ completed_at: null }).eq("id", id).eq("tenant_id", user.tenantId);
  setFlash(c, "info", "Prazo reaberto.");
  return c.redirect("/deadlines");
});

// POST /deadlines/:id/delete -- soft delete.
deadlinesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("deadlines").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  setFlash(c, "success", "Prazo excluido.");
  return c.redirect("/deadlines");
});
