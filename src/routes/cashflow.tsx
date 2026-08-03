import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { caseBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const cashflowRoutes = new Hono<AppEnv>();

cashflowRoutes.use("*", requireAuth);
cashflowRoutes.use("*", requireRole("socio", "admin", "financeiro"));

// --- Schemas ---

const expenseSchema = z.object({
  description: z.string().min(1, "Descricao e obrigatoria"),
  amount_cents: z.coerce.number().int().positive("Valor deve ser positivo").max(1e12, "Valor excede o limite maximo"),
  category: z.enum(["aluguel", "salario", "impostos", "software", "material", "viagem", "outros"]),
  status: z.enum(["pending", "paid", "cancelled"]),
  due_date: z.string().optional(),
  case_id: z.string().optional(),
  notes: z.string().optional(),
});

const accountSchema = z.object({
  name: z.string().min(1, "Nome e obrigatorio"),
  bank: z.string().min(1, "Banco e obrigatorio"),
  agency: z.string().optional(),
  account: z.string().optional(),
  balance_cents: z.coerce.number(),
});

// --- Helpers ---

const CATEGORY_LABELS: Record<string, string> = {
  aluguel: "Aluguel",
  salario: "Salario",
  impostos: "Impostos",
  software: "Software",
  material: "Material",
  viagem: "Viagem",
  outros: "Outros",
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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

// --- GET / -- cash flow dashboard ---

cashflowRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [honorariosRes, expensesRes, accountsRes, paidHonorariosRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("id, description, amount_cents, status, due_date, clients(name)")
      .eq("tenant_id", user.tenantId)
      .in("status", ["pending", "overdue"])
      .order("due_date", { ascending: true }),
    supabase
      .from("expenses")
      .select("id, description, amount_cents, status, category, due_date")
      .eq("tenant_id", user.tenantId)
      .in("status", ["pending"])
      .order("due_date", { ascending: true }),
    supabase
      .from("bank_accounts")
      .select("id, name, bank, agency, account, balance_cents, active", { count: "exact" })
      .eq("tenant_id", user.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("honorarios")
      .select("amount_cents")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid"),
  ]);

  const accountsCount = accountsRes.count;
  const accountsTotalPages = accountsCount ? Math.ceil(accountsCount / limit) : 1;

  const receber = (honorariosRes.data ?? []).reduce((s, h) => s + h.amount_cents, 0);
  const pagar = (expensesRes.data ?? []).reduce((s, e) => s + e.amount_cents, 0);
  const saldoProjetado = receber - pagar;
  const totalFaturado = (paidHonorariosRes.data ?? []).reduce((s, h) => s + h.amount_cents, 0);

  // Combine upcoming transactions (next 30 days).
  type Tx = { date: string | null; tipo: "Receita" | "Despesa"; descricao: string; valor: number; status: string };
  const txs: Tx[] = [];
  for (const h of honorariosRes.data ?? []) {
    txs.push({ date: h.due_date, tipo: "Receita", descricao: h.description, valor: h.amount_cents, status: h.status });
  }
  for (const e of expensesRes.data ?? []) {
    txs.push({ date: e.due_date, tipo: "Despesa", descricao: e.description, valor: e.amount_cents, status: e.status });
  }
  const upcoming = txs
    .filter((t) => t.date && new Date(t.date) <= in30)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const txRows = upcoming.map((t) => [
    formatDate(t.date),
    t.tipo,
    t.descricao,
    formatCurrency(t.valor),
    <Badge color={statusColor(t.status)}>{STATUS_LABELS[t.status] ?? t.status}</Badge> as unknown as string,
  ]);

  const accountRows = (accountsRes.data ?? []).map((a) => [
    a.name,
    a.bank,
    a.agency ?? "-",
    a.account ?? "-",
    formatCurrency(a.balance_cents),
    a.active ? (
      <Badge color="green" icon="ph-check-circle">Ativa</Badge>
    ) : (
      <Badge color="gray" icon="ph-x-circle">Inativa</Badge>
    ) as unknown as string,
    <a href={`/cashflow/accounts/${a.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Fluxo de Caixa", active: "cashflow" },
    <>
      <PageHeader title="Fluxo de Caixa" icon="ph-chart-line-up" />

      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrow-fat-line-up text-h3 text-status-green" aria-hidden="true"></i>Receber
          </div>
          <div class="text-h2 font-bold text-status-green">{formatCurrency(receber)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrow-fat-line-down text-h3 text-status-red" aria-hidden="true"></i>Pagar
          </div>
          <div class="text-h2 font-bold text-status-red">{formatCurrency(pagar)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-scales text-h3 text-[#0568ff]" aria-hidden="true"></i>Saldo Projetado
          </div>
          <div class="text-h2 font-bold text-[#0568ff]">{formatCurrency(saldoProjetado)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-chart-bar text-h3 text-status-blue" aria-hidden="true"></i>Total Faturado
          </div>
          <div class="text-h2 font-bold text-status-blue">{formatCurrency(totalFaturado)}</div>
        </Panel>
      </div>

      <div class="mb-6">
        <Panel title="Proximos 30 dias" icon="ph-calendar">
          <Table
            columns={[
              { label: "Data" },
              { label: "Tipo" },
              { label: "Descricao" },
              { label: "Valor", align: "right" },
              { label: "Status" },
            ]}
            rows={txRows}
            emptyMsg="Nenhuma transacao nos proximos 30 dias."
            emptyIcon="ph-calendar"
            ariaLabel="Transacoes proximos 30 dias"
            count={upcoming.length}
            countLabel="transacao(oes)"
          />
        </Panel>
      </div>

      <Panel title="Contas Bancarias" icon="ph-bank">
        <Table
          columns={[
            { label: "Nome" },
            { label: "Banco" },
            { label: "Agencia" },
            { label: "Conta" },
            { label: "Saldo", align: "right" },
            { label: "Status" },
            { label: "Acoes" },
          ]}
          rows={accountRows}
          emptyMsg="Nenhuma conta bancaria cadastrada."
          emptyIcon="ph-bank"
          ariaLabel="Contas bancarias"
          count={accountsCount ?? 0}
          countLabel="transacao(oes)"
          pagination={{
            currentPage: page,
            totalPages: accountsTotalPages,
            basePath: "/cashflow",
          }}
        />
      </Panel>
    </>,
  );
});

// --- GET /expenses -- list expenses ---

cashflowRoutes.get("/expenses", async (c) => {
  const user = c.get("user");
  const status = c.req.query("status") ?? "";

  let query = supabase
    .from("expenses")
    .select("id, description, category, amount_cents, due_date, status")
    .eq("tenant_id", user.tenantId)
    .order("due_date", { ascending: false })
    .limit(50);

  if (status) query = query.eq("status", status);

  const { data: expenses } = await query;

  // Fetch cases for the modal select.
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  const rows = (expenses ?? []).map((e) => [
    e.description,
    CATEGORY_LABELS[e.category] ?? e.category,
    formatCurrency(e.amount_cents),
    formatDate(e.due_date),
    <Badge color={statusColor(e.status)}>{STATUS_LABELS[e.status] ?? e.status}</Badge> as unknown as string,
    <a href={`/cashflow/expenses/${e.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Contas a Pagar", active: "cashflow" },
    <>
      <PageHeader
        title="Contas a Pagar"
        icon="ph-arrow-fat-line-down"
        actions={() => (
          <Modal id="new-expense" title="Nova Despesa" icon="ph-arrow-fat-line-down" triggerText="Nova Despesa" triggerIcon="ph-plus" action="/cashflow/expenses" submitLabel="Salvar" large>
            <TextField label="Descricao" id="description" name="description" required icon="ph-text-aa" placeholder="Descricao da despesa" />
            <div class="grid grid-cols-2 gap-4">
              <TextField label="Valor (R$)" id="amount_cents" name="amount_cents" type="number" step="0.01" required placeholder="0,00" />
              <Select label="Categoria" id="category" name="category" required
                options={[
                  { value: "aluguel", label: "Aluguel" },
                  { value: "salario", label: "Salario" },
                  { value: "impostos", label: "Impostos" },
                  { value: "software", label: "Software" },
                  { value: "material", label: "Material" },
                  { value: "viagem", label: "Viagem" },
                  { value: "outros", label: "Outros" },
                ]}
              />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <Select label="Status" id="status" name="status" required selected="pending"
                options={[
                  { value: "pending", label: "Pendente" },
                  { value: "paid", label: "Pago" },
                  { value: "cancelled", label: "Cancelado" },
                ]}
              />
              <TextField label="Vencimento" id="due_date" name="due_date" type="date" />
            </div>
            <ComboBox label="Processo (opcional)" id="case_id" name="case_id"
              options={[{ value: "", label: "Nenhum" }, ...(cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }))]}
            />
            <Textarea label="Observacoes" id="notes" name="notes" rows={3} />
          </Modal>
        )}
      />
      <div class="flex gap-2 mb-4">
        <a href="/cashflow/expenses" class={`btn btn-secondary inline-flex items-center gap-1${!status ? " btn-primary" : ""}`}>
          <i class="ph ph-list" aria-hidden="true"></i>Todas
        </a>
        <a href="/cashflow/expenses?status=pending" class={`btn btn-secondary inline-flex items-center gap-1${status === "pending" ? " btn-primary" : ""}`}>
          <i class="ph ph-clock" aria-hidden="true"></i>Pendentes
        </a>
        <a href="/cashflow/expenses?status=paid" class={`btn btn-secondary inline-flex items-center gap-1${status === "paid" ? " btn-primary" : ""}`}>
          <i class="ph ph-check-circle" aria-hidden="true"></i>Pagas
        </a>
        <a href="/cashflow/expenses?status=cancelled" class={`btn btn-secondary inline-flex items-center gap-1${status === "cancelled" ? " btn-primary" : ""}`}>
          <i class="ph ph-x-circle" aria-hidden="true"></i>Canceladas
        </a>
      </div>
      <Table
        columns={[
          { label: "Descricao" },
          { label: "Categoria" },
          { label: "Valor", align: "right" },
          { label: "Vencimento" },
          { label: "Status" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma despesa encontrada."
        emptyIcon="ph-arrow-fat-line-down"
        ariaLabel="Lista de despesas"
      />
    </>,
  );
});

// --- POST /expenses -- create ---

cashflowRoutes.post("/expenses", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const rawAmount = body.amount_cents;
  const amountCents = Math.round(Number(rawAmount) * 100);
  const parsed = expenseSchema.safeParse({ ...body, amount_cents: amountCents });
  if (!parsed.success) return c.redirect("/cashflow/expenses");

  // Validate IDOR-relevant foreign keys.
  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  await supabase.from("expenses").insert({
    tenant_id: user.tenantId,
    description: parsed.data.description,
    amount_cents: parsed.data.amount_cents,
    category: parsed.data.category,
    status: parsed.data.status,
    due_date: parsed.data.due_date ? new Date(parsed.data.due_date).toISOString() : null,
    case_id: parsed.data.case_id || null,
    notes: parsed.data.notes || null,
    paid_at: parsed.data.status === "paid" ? new Date().toISOString() : null,
  });

  return c.redirect("/cashflow/expenses");
});

// --- POST /expenses/:id/pay -- mark as paid ---

cashflowRoutes.post("/expenses/:id/pay", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase
    .from("expenses")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);
  return c.redirect("/cashflow/expenses");
});

// --- GET /receivables -- list honorarios pending/overdue ---

cashflowRoutes.get("/receivables", async (c) => {
  const user = c.get("user");

  const { data: honorarios } = await supabase
    .from("honorarios")
    .select("id, description, amount_cents, status, due_date, clients(name)")
    .eq("tenant_id", user.tenantId)
    .in("status", ["pending", "overdue"])
    .order("due_date", { ascending: true });

  const rows = (honorarios ?? []).map((h) => {
    const clientName = (h.clients as unknown as { name: string } | null)?.name ?? "-";
    return [
      h.description,
      clientName,
      formatCurrency(h.amount_cents),
      formatDate(h.due_date),
      <Badge color={statusColor(h.status)}>{STATUS_LABELS[h.status] ?? h.status}</Badge> as unknown as string,
      <form method="post" action={`/cashflow/receivables/${h.id}/receive`} class="inline">
        <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
          <i class="ph ph-check" aria-hidden="true"></i>Marcar como recebido
        </button>
      </form> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Contas a Receber", active: "cashflow" },
    <>
      <PageHeader title="Contas a Receber" icon="ph-arrow-fat-line-up" />
      <Table
        columns={[
          { label: "Descricao" },
          { label: "Cliente" },
          { label: "Valor", align: "right" },
          { label: "Vencimento" },
          { label: "Status" },
          { label: "Acao" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma conta a receber."
        emptyIcon="ph-arrow-fat-line-up"
        ariaLabel="Contas a receber"
      />
    </>,
  );
});

// --- POST /receivables/:id/receive -- mark honorario as paid ---

cashflowRoutes.post("/receivables/:id/receive", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase
    .from("honorarios")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", user.tenantId);
  return c.redirect("/cashflow/receivables");
});

// --- GET /accounts -- list bank accounts ---

cashflowRoutes.get("/accounts", async (c) => {
  const user = c.get("user");

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, name, bank, agency, account, balance_cents, active")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false });

  const rows = (accounts ?? []).map((a) => [
    a.name,
    a.bank,
    a.agency ?? "-",
    a.account ?? "-",
    formatCurrency(a.balance_cents),
    a.active ? (
      <Badge color="green" icon="ph-check-circle">Ativa</Badge>
    ) : (
      <Badge color="gray" icon="ph-x-circle">Inativa</Badge>
    ) as unknown as string,
    <a href={`/cashflow/accounts/${a.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Contas Bancarias", active: "cashflow" },
    <>
      <PageHeader
        title="Contas Bancarias"
        icon="ph-bank"
        actions={() => (
          <Modal id="new-account" title="Nova Conta Bancaria" icon="ph-bank" triggerText="Nova Conta" triggerIcon="ph-plus" action="/cashflow/accounts" submitLabel="Salvar">
            <TextField label="Nome" id="name" name="name" required icon="ph-tag" placeholder="Conta principal" />
            <div class="grid grid-cols-2 gap-4">
              <TextField label="Banco" id="bank" name="bank" required icon="ph-bank" placeholder="Banco do Brasil" />
              <TextField label="Saldo Inicial (R$)" id="balance_cents" name="balance_cents" type="number" step="0.01" placeholder="0,00" />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <TextField label="Agencia" id="agency" name="agency" placeholder="0001" />
              <TextField label="Conta" id="account" name="account" placeholder="12345-6" />
            </div>
          </Modal>
        )}
      />
      <Table
        columns={[
          { label: "Nome" },
          { label: "Banco" },
          { label: "Agencia" },
          { label: "Conta" },
          { label: "Saldo", align: "right" },
          { label: "Status" },
          { label: "Acoes" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma conta bancaria cadastrada."
        emptyIcon="ph-bank"
        ariaLabel="Contas bancarias"
      />
    </>,
  );
});

// --- POST /accounts -- create ---

cashflowRoutes.post("/accounts", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const rawBalance = body.balance_cents;
  const balanceCents = Math.round(Number(rawBalance ?? 0) * 100);
  const parsed = accountSchema.safeParse({ ...body, balance_cents: balanceCents });
  if (!parsed.success) return c.redirect("/cashflow/accounts");

  await supabase.from("bank_accounts").insert({
    tenant_id: user.tenantId,
    name: parsed.data.name,
    bank: parsed.data.bank,
    agency: parsed.data.agency || null,
    account: parsed.data.account || null,
    balance_cents: parsed.data.balance_cents,
    active: true,
  });

  return c.redirect("/cashflow/accounts");
});

// --- GET /dre -- DRE simplificado ---

cashflowRoutes.get("/dre", async (c) => {
  const user = c.get("user");

  const [paidHonorariosRes, paidExpensesRes] = await Promise.all([
    supabase.from("honorarios").select("amount_cents, type").eq("tenant_id", user.tenantId).eq("status", "paid"),
    supabase.from("expenses").select("amount_cents, category").eq("tenant_id", user.tenantId).eq("status", "paid"),
  ]);

  const revenue = (paidHonorariosRes.data ?? []).reduce((s, h) => s + h.amount_cents, 0);
  const expenses = (paidExpensesRes.data ?? []).reduce((s, e) => s + e.amount_cents, 0);
  const grossProfit = revenue - expenses;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  // Breakdown by honorario type.
  const byType: Record<string, number> = {};
  for (const h of paidHonorariosRes.data ?? []) {
    byType[h.type] = (byType[h.type] ?? 0) + h.amount_cents;
  }
  // Breakdown by expense category.
  const byCategory: Record<string, number> = {};
  for (const e of paidExpensesRes.data ?? []) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount_cents;
  }

  const TYPE_LABELS_DRE: Record<string, string> = {
    contratual: "Contratual",
    sucumbencial: "Sucumbencial",
    exito: "Exito",
    mensalidade: "Mensalidade",
    parcelamento: "Parcelamento",
  };

  const revenueRows = Object.entries(byType).map(([type, val]) => [
    TYPE_LABELS_DRE[type] ?? type,
    formatCurrency(val),
  ]);
  const expenseRows = Object.entries(byCategory).map(([cat, val]) => [
    CATEGORY_LABELS[cat] ?? cat,
    formatCurrency(val),
  ]);

  return renderPage(
    c,
    { title: "DRE Simplificado", active: "cashflow" },
    <>
      <PageHeader title="DRE Simplificado" icon="ph-chart-line" />

      <div class="grid grid-cols-3 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrow-fat-line-up text-h3 text-status-green" aria-hidden="true"></i>Receita
          </div>
          <div class="text-h2 font-bold text-status-green">{formatCurrency(revenue)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrow-fat-line-down text-h3 text-status-red" aria-hidden="true"></i>Despesas
          </div>
          <div class="text-h2 font-bold text-status-red">{formatCurrency(expenses)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-percent text-h3 text-[#0568ff]" aria-hidden="true"></i>Margem
          </div>
          <div class="text-h2 font-bold text-[#0568ff]">{margin.toFixed(1)}%</div>
        </Panel>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Receita por Tipo" icon="ph-arrow-fat-line-up">
          <Table
            columns={[{ label: "Tipo" }, { label: "Valor", align: "right" }]}
            rows={revenueRows}
            emptyMsg="Sem receita registrada."
            emptyIcon="ph-arrow-fat-line-up"
            ariaLabel="Receita por tipo"
          />
        </Panel>
        <Panel title="Despesas por Categoria" icon="ph-arrow-fat-line-down">
          <Table
            columns={[{ label: "Categoria" }, { label: "Valor", align: "right" }]}
            rows={expenseRows}
            emptyMsg="Sem despesa registrada."
            emptyIcon="ph-arrow-fat-line-down"
            ariaLabel="Despesas por categoria"
          />
        </Panel>
      </div>

      <Panel title="Resultado" icon="ph-scales">
        <div class="flex items-center justify-between py-2">
          <span class="text-body font-semibold text-gray-700">Lucro Bruto</span>
          <span class={`text-h2 font-bold ${grossProfit >= 0 ? "text-status-green" : "text-status-red"}`}>
            {formatCurrency(grossProfit)}
          </span>
        </div>
      </Panel>
    </>,
  );
});

// --- GET /dfc -- DFC simplificado ---

cashflowRoutes.get("/dfc", async (c) => {
  const user = c.get("user");

  // Last 6 months.
  const months: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    months.push({
      label: start.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
      start,
      end,
    });
  }

  // Fetch all paid honorarios and expenses for the last 6 months.
  const sixMonthsAgo = months[0]!.start.toISOString();
  const [paidHonorariosRes, paidExpensesRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("amount_cents, paid_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid")
      .gte("paid_at", sixMonthsAgo),
    supabase
      .from("expenses")
      .select("amount_cents, category, paid_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid")
      .gte("paid_at", sixMonthsAgo),
  ]);

  const dfcRows = months.map((m) => {
    const inflow = (paidHonorariosRes.data ?? [])
      .filter((h) => h.paid_at && new Date(h.paid_at) >= m.start && new Date(h.paid_at) <= m.end)
      .reduce((s, h) => s + h.amount_cents, 0);
    const outflow = (paidExpensesRes.data ?? [])
      .filter((e) => e.paid_at && new Date(e.paid_at) >= m.start && new Date(e.paid_at) <= m.end)
      .reduce((s, e) => s + e.amount_cents, 0);
    const net = inflow - outflow;
    return [
      m.label,
      formatCurrency(inflow),
      formatCurrency(outflow),
      <span class={net >= 0 ? "text-status-green font-semibold" : "text-status-red font-semibold"}>{formatCurrency(net)}</span> as unknown as string,
    ];
  });

  // Simplified category breakdown.
  const operating = (paidExpensesRes.data ?? [])
    .filter((e) => ["aluguel", "salario", "software", "material"].includes(e.category))
    .reduce((s, e) => s + e.amount_cents, 0);
  const investing = (paidExpensesRes.data ?? [])
    .filter((e) => e.category === "material")
    .reduce((s, e) => s + e.amount_cents, 0);
  const financing = (paidExpensesRes.data ?? [])
    .filter((e) => ["impostos", "viagem", "outros"].includes(e.category))
    .reduce((s, e) => s + e.amount_cents, 0);

  return renderPage(
    c,
    { title: "DFC Simplificado", active: "cashflow" },
    <>
      <PageHeader title="DFC Simplificado" icon="ph-chart-line" />

      <div class="grid grid-cols-3 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-storefront text-h3 text-[#0568ff]" aria-hidden="true"></i>Operacional
          </div>
          <div class="text-h2 font-bold text-[#0568ff]">{formatCurrency(operating)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrows-left-right text-h3 text-status-blue" aria-hidden="true"></i>Investimento
          </div>
          <div class="text-h2 font-bold text-status-blue">{formatCurrency(investing)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-hand-coins text-h3 text-status-yellow" aria-hidden="true"></i>Financiamento
          </div>
          <div class="text-h2 font-bold text-status-yellow">{formatCurrency(financing)}</div>
        </Panel>
      </div>

      <Panel title="Fluxo de Caixa por Mes (ultimos 6 meses)" icon="ph-calendar">
        <Table
          columns={[
            { label: "Mes" },
            { label: "Entradas", align: "right" },
            { label: "Saidas", align: "right" },
            { label: "Liquido", align: "right" },
          ]}
          rows={dfcRows}
          emptyMsg="Sem movimentacao no periodo."
          emptyIcon="ph-calendar"
          ariaLabel="Fluxo de caixa por mes"
        />
      </Panel>
    </>,
  );
});
