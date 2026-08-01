import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
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
  const showAll = c.req.query("all") === "1";

  let query = supabase
    .from("deadlines")
    .select("id, title, due_date, priority, completed_at, case_id, cases(title)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });

  if (!showAll) query = query.is("completed_at", null);

  const [deadlinesRes, casesRes] = await Promise.all([
    query,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const deadlines = deadlinesRes.data;
  const caseOptions = (casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }));
  const now = new Date();

  const rows = (deadlines ?? []).map((d) => {
    const due = new Date(d.due_date);
    const overdue = due < now && !d.completed_at;
    return [
      <a href={`/cases/${d.case_id}`} class="text-terracota-600 hover:underline">{(d.cases as unknown as { title: string } | null)?.title ?? "-"}</a> as unknown as string,
      d.title,
      new Date(d.due_date).toLocaleDateString("pt-BR"),
      `P${d.priority}`,
      d.completed_at
        ? <Badge color="gray">Concluido</Badge>
        : overdue
          ? <Badge color="red">Atrasado</Badge>
          : <Badge color="yellow">Pendente</Badge> as unknown as string,
      d.completed_at ? null : (
        <form method="post" action={`/deadlines/${d.id}/complete`}>
          <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-check" aria-hidden="true"></i>Concluir</button>
        </form>
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
        columns={[{ label: "Processo" }, { label: "Prazo" }, { label: "Data" }, { label: "Prioridade" }, { label: "Status" }, { label: "" }]}
        rows={rows}
        emptyMsg="Nenhum prazo."
        emptyIcon="ph-check-circle"
        ariaLabel="Lista de prazos"
      />
    </>,
  );
});

// POST /deadlines -- create.
deadlinesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = deadlineSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/deadlines");

  await supabase.from("deadlines").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id,
    title: parsed.data.title,
    due_date: new Date(parsed.data.due_date).toISOString(),
    priority: parsed.data.priority,
  });

  return c.redirect("/deadlines");
});

// POST /deadlines/:id/complete -- mark as completed.
deadlinesRoutes.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("deadlines").update({ completed_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/deadlines");
});

// POST /deadlines/:id/reopen -- reopen.
deadlinesRoutes.post("/:id/reopen", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("deadlines").update({ completed_at: null }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/deadlines");
});

// POST /deadlines/:id/delete -- soft delete.
deadlinesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("deadlines").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/deadlines");
});
