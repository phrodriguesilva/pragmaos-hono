import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const honorariosRoutes = new Hono<AppEnv>();

honorariosRoutes.use("*", requireAuth);

const honorarioSchema = z.object({
  client_id: z.string().uuid("Cliente invalido"),
  case_id: z.string().optional(),
  description: z.string().min(1, "Descricao e obrigatoria"),
  type: z.enum(["contratual", "sucumbencial", "exito", "mensalidade", "parcelamento"]),
  amount_cents: z.coerce.number().positive("Valor deve ser positivo"),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  due_date: z.string().optional(),
  installments: z.coerce.number().int().min(1).optional(),
  notes: z.string().optional(),
});

const TYPE_LABELS: Record<string, string> = {
  contratual: "Contratual",
  sucumbencial: "Sucumbencial",
  exito: "Exito",
  mensalidade: "Mensalidade",
  parcelamento: "Parcelamento",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

function statusColor(status: string): "green" | "red" | "yellow" | "gray" {
  if (status === "paid") return "green";
  if (status === "overdue") return "red";
  if (status === "cancelled") return "gray";
  return "yellow";
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0] ?? "";
}

// GET /honorarios -- list with summary.
honorariosRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: honorarios } = await supabase
    .from("honorarios")
    .select("id, description, type, amount_cents, status, due_date, clients(name)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Summary totals.
  const { data: totals } = await supabase
    .from("honorarios")
    .select("status, amount_cents")
    .eq("tenant_id", user.tenantId);

  const sumByStatus: Record<string, number> = {};
  for (const t of totals ?? []) {
    sumByStatus[t.status] = (sumByStatus[t.status] ?? 0) + t.amount_cents;
  }

  const rows = (honorarios ?? []).map((h) => {
    const clientName = (h.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      <a href={`/honorarios/${h.id}`} class="text-navy-700 hover:underline">{h.description}</a> as unknown as string,
      clientName,
      TYPE_LABELS[h.type] ?? h.type,
      formatCurrency(h.amount_cents),
      formatDate(h.due_date),
      <Badge color={statusColor(h.status)}>{STATUS_LABELS[h.status] ?? h.status}</Badge> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Honorarios", active: "honorarios" },
    <>
      <PageHeader
        title="Honorarios"
        icon="ph-hand-coins"
        actions={() => (
          <a href="/honorarios/new" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-plus" aria-hidden="true"></i>Nova Fatura
          </a>
        )}
      />
      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-clock text-h3 text-status-yellow" aria-hidden="true"></i>Pendente
          </div>
          <div class="text-h2 font-bold text-status-yellow">{formatCurrency(sumByStatus.pending ?? 0)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-check-circle text-h3 text-status-green" aria-hidden="true"></i>Pago
          </div>
          <div class="text-h2 font-bold text-status-green">{formatCurrency(sumByStatus.paid ?? 0)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-warning text-h3 text-status-red" aria-hidden="true"></i>Atrasado
          </div>
          <div class="text-h2 font-bold text-status-red">{formatCurrency(sumByStatus.overdue ?? 0)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-x-circle text-h3 text-gray-500" aria-hidden="true"></i>Cancelado
          </div>
          <div class="text-h2 font-bold text-gray-500">{formatCurrency(sumByStatus.cancelled ?? 0)}</div>
        </Panel>
      </div>
      <Table
        columns={[
          { label: "Descricao" },
          { label: "Cliente" },
          { label: "Tipo" },
          { label: "Valor" },
          { label: "Vencimento" },
          { label: "Status" },
        ]}
        rows={rows}
        emptyMsg="Nenhum honorario encontrado."
        emptyIcon="ph-hand-coins"
        ariaLabel="Lista de honorarios"
      />
    </>,
  );
});

// GET /honorarios/new -- create form.
honorariosRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const [clientsRes, casesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  return renderPage(
    c,
    { title: "Nova Fatura", active: "honorarios" },
    <>
      <PageHeader title="Nova Fatura" icon="ph-plus-circle" />
      <Panel>
        <form method="post" action="/honorarios" class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id" required
            options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <Select label="Processo (opcional)" id="case_id" name="case_id"
            options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
          />
          <TextField label="Descricao" id="description" name="description" required icon="ph-text-aa" placeholder="Descricao do honorario" />
          <div class="grid grid-cols-2 gap-4">
            <Select label="Tipo" id="type" name="type" required
              options={[
                { value: "contratual", label: "Contratual" },
                { value: "sucumbencial", label: "Sucumbencial" },
                { value: "exito", label: "Exito" },
                { value: "mensalidade", label: "Mensalidade" },
                { value: "parcelamento", label: "Parcelamento" },
              ]}
            />
            <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <Select label="Status" id="status" name="status" required selected="pending"
              options={[
                { value: "pending", label: "Pendente" },
                { value: "paid", label: "Pago" },
                { value: "overdue", label: "Atrasado" },
                { value: "cancelled", label: "Cancelado" },
              ]}
            />
            <TextField label="Vencimento" id="due_date" name="due_date" type="date" />
            <TextField label="Parcelas" id="installments" name="installments" type="number" value="1" />
          </div>
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href="/honorarios" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /honorarios -- create.
honorariosRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = honorarioSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect("/honorarios/new");
  }

  const rawAmount = (body.amount_cents as string) ?? "0";
  const amountCents = Math.round(Number(rawAmount) * 100);

  const { error } = await supabase.from("honorarios").insert({
    tenant_id: user.tenantId,
    client_id: parsed.data.client_id,
    case_id: parsed.data.case_id || null,
    description: parsed.data.description,
    type: parsed.data.type,
    amount_cents: amountCents,
    status: parsed.data.status,
    due_date: parsed.data.due_date || null,
    paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
    installments: parsed.data.installments ?? 1,
    notes: parsed.data.notes || null,
  });

  if (error) {
    return c.redirect("/honorarios/new");
  }

  return c.redirect("/honorarios");
});

// GET /honorarios/:id -- detail.
honorariosRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: h } = await supabase
    .from("honorarios")
    .select("*, clients(name), cases(title)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!h) return c.html("Honorario nao encontrado.", 404);

  const client = h.clients as { name: string } | null;
  const caseRow = h.cases as { title: string } | null;

  return renderPage(
    c,
    { title: h.description, active: "honorarios" },
    <>
      <PageHeader
        title={h.description}
        icon="ph-hand-coins"
        actions={() => (
          <div class="flex gap-2">
            <a href={`/honorarios/${id}/edit`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-pencil" aria-hidden="true"></i>Editar</a>
            <form method="post" action={`/honorarios/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir este honorario?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Excluir
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados do honorario" icon="ph-hand-coins">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Descricao: </dt><dd class="inline">{h.description}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${h.client_id}`} class="text-navy-700 hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{h.case_id ? <a href={`/cases/${h.case_id}`} class="text-navy-700 hover:underline">{caseRow?.title ?? "-"}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Tipo: </dt><dd class="inline">{TYPE_LABELS[h.type] ?? h.type}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor: </dt><dd class="inline">{formatCurrency(h.amount_cents)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline">
              <Badge color={statusColor(h.status)}>{STATUS_LABELS[h.status] ?? h.status}</Badge>
            </dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Vencimento: </dt><dd class="inline">{formatDate(h.due_date)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Pago em: </dt><dd class="inline">{formatDate(h.paid_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Parcelas: </dt><dd class="inline">{h.installments ?? 1}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(h.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(h.updated_at)}</dd></div>
          </dl>
        </Panel>
        {h.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{h.notes}</p>
          </Panel>
        ) : null}
      </div>
    </>,
  );
});

// GET /honorarios/:id/edit -- edit form.
honorariosRoutes.get("/:id/edit", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: h } = await supabase
    .from("honorarios")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!h) return c.html("Honorario nao encontrado.", 404);

  const [clientsRes, casesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  return renderPage(
    c,
    { title: `Editar ${h.description}`, active: "honorarios" },
    <>
      <PageHeader title={`Editar ${h.description}`} icon="ph-pencil" />
      <Panel>
        <form method="post" action={`/honorarios/${id}`} class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id" required selected={h.client_id}
            options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <Select label="Processo (opcional)" id="case_id" name="case_id" selected={h.case_id ?? ""}
            options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
          />
          <TextField label="Descricao" id="description" name="description" required icon="ph-text-aa" value={h.description} />
          <div class="grid grid-cols-2 gap-4">
            <Select label="Tipo" id="type" name="type" required selected={h.type}
              options={[
                { value: "contratual", label: "Contratual" },
                { value: "sucumbencial", label: "Sucumbencial" },
                { value: "exito", label: "Exito" },
                { value: "mensalidade", label: "Mensalidade" },
                { value: "parcelamento", label: "Parcelamento" },
              ]}
            />
            <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" value={String(h.amount_cents / 100)} />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <Select label="Status" id="status" name="status" required selected={h.status}
              options={[
                { value: "pending", label: "Pendente" },
                { value: "paid", label: "Pago" },
                { value: "overdue", label: "Atrasado" },
                { value: "cancelled", label: "Cancelado" },
              ]}
            />
            <TextField label="Vencimento" id="due_date" name="due_date" type="date" value={toDateInput(h.due_date)} />
            <TextField label="Parcelas" id="installments" name="installments" type="number" value={String(h.installments ?? 1)} />
          </div>
          <Textarea label="Observacoes" id="notes" name="notes" rows={3}>
            {h.notes ?? ""}
          </Textarea>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-floppy-disk" aria-hidden="true"></i>Salvar</button>
            <a href={`/honorarios/${id}`} class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// POST /honorarios/:id -- update.
honorariosRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = honorarioSchema.safeParse(body);

  if (!parsed.success) {
    return c.redirect(`/honorarios/${id}/edit`);
  }

  const rawAmount = (body.amount_cents as string) ?? "0";
  const amountCents = Math.round(Number(rawAmount) * 100);

  await supabase
    .from("honorarios")
    .update({
      client_id: parsed.data.client_id,
      case_id: parsed.data.case_id || null,
      description: parsed.data.description,
      type: parsed.data.type,
      amount_cents: amountCents,
      status: parsed.data.status,
      due_date: parsed.data.due_date || null,
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
      installments: parsed.data.installments ?? 1,
      notes: parsed.data.notes || null,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/honorarios/${id}`);
});

// POST /honorarios/:id/delete -- hard delete.
honorariosRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("honorarios")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/honorarios");
});
