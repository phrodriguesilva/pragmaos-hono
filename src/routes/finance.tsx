import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const financeRoutes = new Hono<AppEnv>();

financeRoutes.use("*", requireAuth);
financeRoutes.use("*", requireRole("socio", "financeiro"));

const invoiceSchema = z.object({
  client_id: z.string().uuid("Cliente invalido"),
  case_id: z.string().optional(),
  number: z.string().min(1, "Numero e obrigatorio"),
  amount_cents: z.coerce.number().int().positive("Valor deve ser positivo"),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

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

financeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const status = c.req.query("status") ?? "";
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (status) queryParams.status = status;
  if (search) queryParams.search = search;

  let query = supabase
    .from("invoices")
    .select("id, number, amount_cents, status, issued_at, due_date, paid_at, clients(name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("issued_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (search) query = query.or(`number.ilike.%${search}%`);

  query = query.range(offset, offset + limit - 1);

  const { data: invoices, count } = await query;
  const totalPages = count ? Math.ceil(count / limit) : 1;

  // Summary totals.
  const { data: totals } = await supabase
    .from("invoices")
    .select("status, amount_cents")
    .eq("tenant_id", user.tenantId);

  const sumByStatus: Record<string, number> = {};
  for (const t of totals ?? []) {
    sumByStatus[t.status] = (sumByStatus[t.status] ?? 0) + t.amount_cents;
  }

  // Fetch clients and cases for the "Nova Fatura" modal comboboxes.
  const [clientsRes, casesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const rows = (invoices ?? []).map((inv) => [
    <a href={`/finance/${inv.id}`} class="text-[#0568ff] hover:underline">{inv.number}</a> as unknown as string,
    (inv.clients as unknown as { name: string } | null)?.name ?? "-",
    formatCurrency(inv.amount_cents),
    formatDate(inv.issued_at),
    formatDate(inv.due_date),
    <Badge color={statusColor(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge> as unknown as string,
    <a href={`/finance/${inv.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Financeiro", active: "honorarios" },
    <>
      <PageHeader title="Financeiro" icon="ph-hand-coins" actions={() => (
        <Modal id="new-invoice" title="Nova Fatura" icon="ph-currency-dollar" triggerText="Nova Fatura" triggerIcon="ph-plus" action="/finance" submitLabel="Salvar" large>
          <ComboBox label="Cliente" id="client_id" name="client_id" required
            options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
            options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
          />
          <TextField label="Numero" id="number" name="number" required placeholder="FAT-2026-001" icon="ph-hash" />
          <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" icon="ph-currency-dollar" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Vencimento" id="due_date" name="due_date" type="date" />
            <Select label="Status" id="status" name="status" required selected="pending"
              options={[
                { value: "pending", label: "Pendente" },
                { value: "paid", label: "Pago" },
                { value: "overdue", label: "Atrasado" },
                { value: "cancelled", label: "Cancelado" },
              ]}
            />
          </div>
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
        </Modal>
      )} />
      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-2"><i class="ph ph-clock text-h3 text-status-yellow" aria-hidden="true"></i>Pendente</div><div class="text-h2 font-bold text-status-yellow">{formatCurrency(sumByStatus.pending ?? 0)}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-2"><i class="ph ph-check-circle text-h3 text-status-green" aria-hidden="true"></i>Pago</div><div class="text-h2 font-bold text-status-green">{formatCurrency(sumByStatus.paid ?? 0)}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-2"><i class="ph ph-warning text-h3 text-status-red" aria-hidden="true"></i>Atrasado</div><div class="text-h2 font-bold text-status-red">{formatCurrency(sumByStatus.overdue ?? 0)}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500 flex items-center gap-2"><i class="ph ph-x-circle text-h3 text-gray-500" aria-hidden="true"></i>Cancelado</div><div class="text-h2 font-bold text-gray-500">{formatCurrency(sumByStatus.cancelled ?? 0)}</div></Panel>
      </div>
      <form method="get" action="/finance" class="mb-4 flex gap-4 items-end">
        <TextField
          label="Buscar"
          id="search"
          name="search"
          type="text"
          value={search}
          placeholder="Numero da fatura..."
          icon="ph-magnifying-glass"
        />
        <Select
          label="Status"
          id="status"
          name="status"
          selected={status}
          options={[
            { value: "", label: "Todos" },
            { value: "pending", label: "Pendente" },
            { value: "paid", label: "Pago" },
            { value: "overdue", label: "Atrasado" },
            { value: "cancelled", label: "Cancelado" },
          ]}
        />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "Numero" }, { label: "Cliente" }, { label: "Valor" }, { label: "Emissao" }, { label: "Vencimento" }, { label: "Status" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhuma fatura."
        emptyIcon="ph-currency-dollar"
        ariaLabel="Lista de faturas"
        count={count ?? 0}
        countLabel="fatura(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/finance",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

financeRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  // amount_cents comes as a decimal (e.g. "150.50"); convert to cents.
  const rawAmount = body.amount_cents;
  const amountCents = Math.round(Number(rawAmount) * 100);
  const parsed = invoiceSchema.safeParse({ ...body, amount_cents: amountCents });
  if (!parsed.success) return c.redirect("/finance");

  await supabase.from("invoices").insert({
    tenant_id: user.tenantId,
    client_id: parsed.data.client_id,
    case_id: parsed.data.case_id || null,
    number: parsed.data.number,
    amount_cents: parsed.data.amount_cents,
    status: parsed.data.status,
    due_date: parsed.data.due_date ? new Date(parsed.data.due_date).toISOString() : null,
    paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
    notes: parsed.data.notes || null,
  });

  return c.redirect("/finance");
});

// GET /finance/:id -- detail.
financeRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: inv } = await supabase
    .from("invoices")
    .select("*, clients(name), cases(title)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!inv) return c.html("Fatura nao encontrada.", 404);

  const [clientsRes, casesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const client = inv.clients as { name: string } | null;
  const caseRow = inv.cases as { title: string } | null;

  return renderPage(
    c,
    { title: inv.number, active: "finance" },
    <>
      <PageHeader
        title={inv.number}
        icon="ph-currency-dollar"
        actions={() => (
          <div class="flex gap-2">
            <Modal id="edit-invoice" title="Editar Fatura" icon="ph-pencil" triggerText="Editar" triggerIcon="ph-pencil" triggerVariant="secondary" action={`/finance/${id}`} submitLabel="Salvar Alteracoes" large>
              <ComboBox label="Cliente" id="client_id" name="client_id" required selected={inv.client_id}
                options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
              />
              <ComboBox label="Processo (opcional)" id="case_id" name="case_id" selected={inv.case_id ?? ""}
                options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
              />
              <TextField label="Numero" id="number" name="number" required value={inv.number} />
              <div class="grid grid-cols-2 gap-4">
                <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" value={String(inv.amount_cents / 100)} />
                <Select label="Status" id="status" name="status" required selected={inv.status}
                  options={[
                    { value: "pending", label: "Pendente" },
                    { value: "paid", label: "Pago" },
                    { value: "overdue", label: "Atrasado" },
                    { value: "cancelled", label: "Cancelado" },
                  ]}
                />
              </div>
              <div class="grid grid-cols-2 gap-4">
                <TextField label="Vencimento" id="due_date" name="due_date" type="date" value={toDateInput(inv.due_date)} />
              </div>
              <Textarea label="Observacoes" id="notes" name="notes" rows={3}>
                {inv.notes ?? ""}
              </Textarea>
            </Modal>
            <form method="post" action={`/finance/${id}/delete`}>
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Cancelar esta fatura?')">
                <i class="ph ph-trash" aria-hidden="true"></i>Cancelar Fatura
              </button>
            </form>
          </div>
        )}
      />
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Dados da fatura" icon="ph-currency-dollar">
          <dl class="flex flex-col gap-2 text-body-sm">
            <div><dt class="font-semibold text-gray-700 inline">Numero: </dt><dd class="inline">{inv.number}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Cliente: </dt><dd class="inline"><a href={`/clients/${inv.client_id}`} class="text-[#0568ff] hover:underline">{client?.name ?? "-"}</a></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline">{inv.case_id ? <a href={`/cases/${inv.case_id}`} class="text-[#0568ff] hover:underline">{caseRow?.title ?? "-"}</a> : "-"}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Valor: </dt><dd class="inline">{formatCurrency(inv.amount_cents)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Status: </dt><dd class="inline"><Badge color={statusColor(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Badge></dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Emissao: </dt><dd class="inline">{formatDate(inv.issued_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Vencimento: </dt><dd class="inline">{formatDate(inv.due_date)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Pago em: </dt><dd class="inline">{formatDate(inv.paid_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Criado em: </dt><dd class="inline">{formatDate(inv.created_at)}</dd></div>
            <div><dt class="font-semibold text-gray-700 inline">Atualizado em: </dt><dd class="inline">{formatDate(inv.updated_at)}</dd></div>
          </dl>
        </Panel>
        {inv.notes ? (
          <Panel title="Observacoes" icon="ph-note">
            <p class="text-body-sm text-gray-700 whitespace-pre-wrap">{inv.notes}</p>
          </Panel>
        ) : null}
      </div>
    </>,
  );
});

// POST /finance/:id -- update.
financeRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  // amount_cents comes as a decimal (e.g. "150.50"); convert to cents.
  const rawAmount = body.amount_cents;
  const amountCents = Math.round(Number(rawAmount) * 100);
  const parsed = invoiceSchema.safeParse({ ...body, amount_cents: amountCents });
  if (!parsed.success) return c.redirect(`/finance/${id}`);

  await supabase
    .from("invoices")
    .update({
      client_id: parsed.data.client_id,
      case_id: parsed.data.case_id || null,
      number: parsed.data.number,
      amount_cents: parsed.data.amount_cents,
      status: parsed.data.status,
      due_date: parsed.data.due_date ? new Date(parsed.data.due_date).toISOString() : null,
      paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
      notes: parsed.data.notes || null,
    })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect(`/finance/${id}`);
});

// POST /finance/:id/delete -- soft delete (set status to "cancelled").
financeRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/finance");
});
