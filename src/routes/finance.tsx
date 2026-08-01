import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Textarea, Panel, Badge } from "../components/ui";

export const financeRoutes = new Hono<AppEnv>();

financeRoutes.use("*", requireAuth);

const invoiceSchema = z.object({
  client_id: z.string().uuid("Cliente invalido"),
  case_id: z.string().optional(),
  number: z.string().min(1, "Numero e obrigatorio"),
  amount_cents: z.coerce.number().int().positive("Valor deve ser positivo"),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  due_date: z.string().optional(),
  notes: z.string().optional(),
});

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

financeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const status = c.req.query("status") ?? "";

  let query = supabase
    .from("invoices")
    .select("id, number, amount_cents, status, issued_at, due_date, paid_at, clients(name)")
    .eq("tenant_id", user.tenantId)
    .order("issued_at", { ascending: false })
    .limit(50);

  if (status) query = query.eq("status", status);

  const { data: invoices } = await query;

  // Summary totals.
  const { data: totals } = await supabase
    .from("invoices")
    .select("status, amount_cents")
    .eq("tenant_id", user.tenantId);

  const sumByStatus: Record<string, number> = {};
  for (const t of totals ?? []) {
    sumByStatus[t.status] = (sumByStatus[t.status] ?? 0) + t.amount_cents;
  }

  const rows = (invoices ?? []).map((inv) => [
    inv.number,
    (inv.clients as unknown as { name: string } | null)?.name ?? "-",
    formatCurrency(inv.amount_cents),
    new Date(inv.issued_at).toLocaleDateString("pt-BR"),
    inv.due_date ? new Date(inv.due_date).toLocaleDateString("pt-BR") : "-",
    <Badge color={inv.status === "paid" ? "green" : inv.status === "overdue" ? "red" : inv.status === "cancelled" ? "gray" : "yellow"}>
      {inv.status === "paid" ? "Pago" : inv.status === "overdue" ? "Atrasado" : inv.status === "cancelled" ? "Cancelado" : "Pendente"}
    </Badge> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Financeiro", active: "finance" },
    <>
      <PageHeader title="Financeiro" actions={() => <a href="/finance/new" class="btn btn-primary">Nova Fatura</a>} />
      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel><div class="text-body-sm text-gray-500">Pendente</div><div class="text-h2 font-bold text-status-yellow">{formatCurrency(sumByStatus.pending ?? 0)}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500">Pago</div><div class="text-h2 font-bold text-status-green">{formatCurrency(sumByStatus.paid ?? 0)}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500">Atrasado</div><div class="text-h2 font-bold text-status-red">{formatCurrency(sumByStatus.overdue ?? 0)}</div></Panel>
        <Panel><div class="text-body-sm text-gray-500">Cancelado</div><div class="text-h2 font-bold text-gray-500">{formatCurrency(sumByStatus.cancelled ?? 0)}</div></Panel>
      </div>
      <Table
        columns={[{ label: "Numero" }, { label: "Cliente" }, { label: "Valor" }, { label: "Emissao" }, { label: "Vencimento" }, { label: "Status" }]}
        rows={rows}
        emptyMsg="Nenhuma fatura."
        ariaLabel="Lista de faturas"
      />
    </>,
  );
});

financeRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const [clientsRes, casesRes] = await Promise.all([
    supabase.from("clients").select("id, name").eq("tenant_id", user.tenantId).is("deleted_at", null).order("name"),
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  return renderPage(
    c,
    { title: "Nova Fatura", active: "finance" },
    <>
      <PageHeader title="Nova Fatura" />
      <Panel>
        <form method="post" action="/finance" class="flex flex-col gap-4">
          <Select label="Cliente" id="client_id" name="client_id" required
            options={(clientsRes.data ?? []).map((cl) => ({ value: cl.id, label: cl.name }))}
          />
          <Select label="Processo (opcional)" id="case_id" name="case_id"
            options={[{ value: "", label: "Nenhum" }, ...(casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
          />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Numero" id="number" name="number" required placeholder="2026-001" />
            <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <Select label="Status" id="status" name="status" required selected="pending"
              options={[
                { value: "pending", label: "Pendente" },
                { value: "paid", label: "Pago" },
                { value: "overdue", label: "Atrasado" },
                { value: "cancelled", label: "Cancelado" },
              ]}
            />
            <TextField label="Vencimento" id="due_date" name="due_date" type="date" />
          </div>
          <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary">Salvar</button>
            <a href="/finance" class="btn btn-secondary">Cancelar</a>
          </div>
        </form>
      </Panel>
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
  if (!parsed.success) return c.redirect("/finance/new");

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
