import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, Select, Panel, Badge } from "../components/ui";

export const financeReportsRoutes = new Hono<AppEnv>();

financeReportsRoutes.use("*", requireAuth);
financeReportsRoutes.use("*", requireRole("socio", "financeiro"));

// --- Helpers ---

const TYPE_LABELS: Record<string, string> = {
  contratual: "Contratual",
  sucumbencial: "Sucumbencial",
  exito: "Exito",
  mensalidade: "Mensalidade",
  parcelamento: "Parcelamento",
};

const CATEGORY_LABELS: Record<string, string> = {
  aluguel: "Aluguel",
  salario: "Salario",
  impostos: "Impostos",
  software: "Software",
  material: "Material",
  viagem: "Viagem",
  outros: "Outros",
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function formatPercent(value: number): string {
  if (!isFinite(value)) return "0,00%";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + "%";
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function monthLabel(year: number, month: number): string {
  const names = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${names[month] ?? ""}/${year}`;
}

// Period selector component (month/year).
function PeriodSelector(currentMonth: string, currentYear: string) {
  const months = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Marco" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];
  const year = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => ({ value: String(year - i), label: String(year - i) }));
  return (
    <form method="get" action="/finance-reports" class="flex items-end gap-2 mb-6">
      <Select label="Mes" id="month" name="month" options={months} selected={currentMonth} />
      <Select label="Ano" id="year" name="year" options={years} selected={currentYear} />
      <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
        <i class="ph ph-funnel" aria-hidden="true"></i>Filtrar
      </button>
    </form>
  );
}

// --- GET / -- reports dashboard ---

financeReportsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const now = new Date();
  const month = c.req.query("month") ?? String(now.getMonth() + 1);
  const year = c.req.query("year") ?? String(now.getFullYear());

  const start = new Date(Number(year), Number(month) - 1, 1);
  const end = new Date(Number(year), Number(month), 0, 23, 59, 59);

  const [honorariosRes, expensesRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("amount_cents, paid_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid")
      .gte("paid_at", start.toISOString())
      .lte("paid_at", end.toISOString()),
    supabase
      .from("expenses")
      .select("amount_cents, paid_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid")
      .gte("paid_at", start.toISOString())
      .lte("paid_at", end.toISOString()),
  ]);

  const receita = (honorariosRes.data ?? []).reduce((s, h) => s + h.amount_cents, 0);
  const despesas = (expensesRes.data ?? []).reduce((s, e) => s + e.amount_cents, 0);
  const lucro = receita - despesas;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;

  return renderPage(
    c,
    { title: "Relatorios Financeiros", active: "finance-reports" },
    <>
      <PageHeader title="Relatorios Financeiros" icon="ph-chart-pie" />
      {PeriodSelector(month, year)}

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrow-fat-line-up text-h3 text-status-green" aria-hidden="true"></i>Receita Total
          </div>
          <div class="text-h2 font-bold text-status-green">{formatCurrency(receita)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-arrow-fat-line-down text-h3 text-status-red" aria-hidden="true"></i>Despesas Totais
          </div>
          <div class="text-h2 font-bold text-status-red">{formatCurrency(despesas)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-scale text-h3 text-terracota-700" aria-hidden="true"></i>Lucro Bruto
          </div>
          <div class={`text-h2 font-bold ${lucro >= 0 ? "text-terracota-700" : "text-status-red"}`}>{formatCurrency(lucro)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500 flex items-center gap-2">
            <i class="ph ph-percent text-h3 text-status-blue" aria-hidden="true"></i>Margem
          </div>
          <div class="text-h2 font-bold text-status-blue">{formatPercent(margem)}</div>
        </Panel>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <Panel title="Relatorios" icon="ph-files">
          <ul class="flex flex-col gap-2">
            <li>
              <a href="/finance-reports/dre" class="text-terracota-600 hover:underline inline-flex items-center gap-1">
                <i class="ph ph-chart-bar" aria-hidden="true"></i>DRE Simplificado
              </a>
            </li>
            <li>
              <a href="/finance-reports/dfc" class="text-terracota-600 hover:underline inline-flex items-center gap-1">
                <i class="ph ph-chart-line-up" aria-hidden="true"></i>DFC Simplificado
              </a>
            </li>
            <li>
              <a href="/finance-reports/cost-centers" class="text-terracota-600 hover:underline inline-flex items-center gap-1">
                <i class="ph ph-tag" aria-hidden="true"></i>Analise de Custos
              </a>
            </li>
            <li>
              <a href="/finance-reports/revenue" class="text-terracota-600 hover:underline inline-flex items-center gap-1">
                <i class="ph ph-currency-dollar" aria-hidden="true"></i>Analise de Receita
              </a>
            </li>
            <li>
              <a href="/finance-reports/productivity" class="text-terracota-600 hover:underline inline-flex items-center gap-1">
                <i class="ph ph-clock-countdown" aria-hidden="true"></i>Produtividade
              </a>
            </li>
            <li>
              <a href="/finance-reports/profitability" class="text-terracota-600 hover:underline inline-flex items-center gap-1">
                <i class="ph ph-chart-line-up" aria-hidden="true"></i>Rentabilidade por Processo
              </a>
            </li>
          </ul>
        </Panel>
      </div>
    </>,
  );
});

// --- GET /dre -- DRE simplificado ---

financeReportsRoutes.get("/dre", async (c) => {
  const user = c.get("user");

  const [honorariosRes, expensesRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("amount_cents")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid"),
    supabase
      .from("expenses")
      .select("amount_cents, category")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid"),
  ]);

  const receitaBruta = (honorariosRes.data ?? []).reduce((s, h) => s + h.amount_cents, 0);

  const byCategory: Record<string, number> = {};
  for (const e of expensesRes.data ?? []) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount_cents;
  }
  const totalDespesas = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const lucroOperacional = receitaBruta - totalDespesas;
  const margemOperacional = receitaBruta > 0 ? (lucroOperacional / receitaBruta) * 100 : 0;

  const rows: (string | number)[][] = [
    ["Receita Operacional Bruta", formatCurrency(receitaBruta)],
  ];
  for (const [cat, val] of Object.entries(byCategory)) {
    rows.push([`(-) ${CATEGORY_LABELS[cat] ?? cat}`, formatCurrency(val)]);
  }
  rows.push(["= Lucro Operacional", formatCurrency(lucroOperacional)]);
  rows.push(["Margem Operacional", formatPercent(margemOperacional)]);

  return renderPage(
    c,
    { title: "DRE Simplificado", active: "finance-reports" },
    <>
      <PageHeader
        title="DRE Simplificado"
        icon="ph-chart-bar"
        actions={() => (
          <a href="/finance-reports" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />
      <Panel title="Demonstracao do Resultado do Exercicio" icon="ph-chart-bar">
        <Table
          columns={[
            { label: "Rubrica" },
            { label: "Valor", align: "right" },
          ]}
          rows={rows}
          emptyMsg="Sem dados para o DRE."
          emptyIcon="ph-chart-bar"
          ariaLabel="DRE simplificado"
        />
      </Panel>
    </>,
  );
});

// --- GET /dfc -- DFC simplificado ---

financeReportsRoutes.get("/dfc", async (c) => {
  const user = c.get("user");
  const now = new Date();

  const months: { year: number; month: number; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    months.push({ year: d.getFullYear(), month: d.getMonth(), start, end });
  }

  const [honorariosRes, expensesRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("amount_cents, paid_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid")
      .gte("paid_at", months[0]!.start.toISOString())
      .lte("paid_at", months[months.length - 1]!.end.toISOString()),
    supabase
      .from("expenses")
      .select("amount_cents, paid_at")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid")
      .gte("paid_at", months[0]!.start.toISOString())
      .lte("paid_at", months[months.length - 1]!.end.toISOString()),
  ]);

  const rows: (string | number)[][] = [];
  let acumulado = 0;
  for (const m of months) {
    const entradas = (honorariosRes.data ?? [])
      .filter((h) => h.paid_at && new Date(h.paid_at) >= m.start && new Date(h.paid_at) <= m.end)
      .reduce((s, h) => s + h.amount_cents, 0);
    const saidas = (expensesRes.data ?? [])
      .filter((e) => e.paid_at && new Date(e.paid_at) >= m.start && new Date(e.paid_at) <= m.end)
      .reduce((s, e) => s + e.amount_cents, 0);
    const saldo = entradas - saidas;
    acumulado += saldo;
    rows.push([
      monthLabel(m.year, m.month),
      formatCurrency(entradas),
      formatCurrency(saidas),
      formatCurrency(saldo),
      formatCurrency(acumulado),
    ]);
  }

  return renderPage(
    c,
    { title: "DFC Simplificado", active: "finance-reports" },
    <>
      <PageHeader
        title="DFC Simplificado"
        icon="ph-chart-line-up"
        actions={() => (
          <a href="/finance-reports" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />
      <Panel title="Demonstracao do Fluxo de Caixa (ultimos 6 meses)" icon="ph-chart-line-up">
        <Table
          columns={[
            { label: "Mes" },
            { label: "Entradas", align: "right" },
            { label: "Saidas", align: "right" },
            { label: "Saldo do mes", align: "right" },
            { label: "Saldo acumulado", align: "right" },
          ]}
          rows={rows}
          emptyMsg="Sem dados de fluxo de caixa."
          emptyIcon="ph-chart-line-up"
          ariaLabel="DFC simplificado"
        />
      </Panel>
    </>,
  );
});

// --- GET /cost-centers -- cost analysis by category ---

financeReportsRoutes.get("/cost-centers", async (c) => {
  const user = c.get("user");

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount_cents, category")
    .eq("tenant_id", user.tenantId)
    .eq("status", "paid");

  const byCategory: Record<string, number> = {};
  for (const e of expenses ?? []) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount_cents;
  }
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);

  const rows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => [
      CATEGORY_LABELS[cat] ?? cat,
      formatCurrency(val),
      formatPercent(total > 0 ? (val / total) * 100 : 0),
    ]);

  return renderPage(
    c,
    { title: "Analise de Custos", active: "finance-reports" },
    <>
      <PageHeader
        title="Analise de Custos"
        icon="ph-tag"
        actions={() => (
          <a href="/finance-reports" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />
      <Panel title="Despesas por Categoria" icon="ph-tag">
        <Table
          columns={[
            { label: "Categoria" },
            { label: "Total despesas", align: "right" },
            { label: "% do total", align: "right" },
          ]}
          rows={rows}
          emptyMsg="Nenhuma despesa paga encontrada."
          emptyIcon="ph-tag"
          ariaLabel="Analise de custos por categoria"
        />
      </Panel>
    </>,
  );
});

// --- GET /revenue -- revenue analysis ---

financeReportsRoutes.get("/revenue", async (c) => {
  const user = c.get("user");

  const [byTypeRes, byClientRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("amount_cents, type")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid"),
    supabase
      .from("honorarios")
      .select("amount_cents, clients(name)")
      .eq("tenant_id", user.tenantId)
      .eq("status", "paid"),
  ]);

  // By type.
  const byType: Record<string, number> = {};
  for (const h of byTypeRes.data ?? []) {
    byType[h.type] = (byType[h.type] ?? 0) + h.amount_cents;
  }
  const totalByType = Object.values(byType).reduce((s, v) => s + v, 0);

  const typeRows = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, val]) => [
      TYPE_LABELS[type] ?? type,
      formatCurrency(val),
      formatPercent(totalByType > 0 ? (val / totalByType) * 100 : 0),
    ]);

  // By client (top 10).
  const byClient: Record<string, number> = {};
  const clientNames: Record<string, string> = {};
  for (const h of byClientRes.data ?? []) {
    const name = (h.clients as unknown as { name?: string } | null)?.name ?? "Sem cliente";
    byClient[name] = (byClient[name] ?? 0) + h.amount_cents;
    clientNames[name] = name;
  }
  const totalByClient = Object.values(byClient).reduce((s, v) => s + v, 0);

  const clientRows = Object.entries(byClient)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, val]) => [
      name,
      formatCurrency(val),
      formatPercent(totalByClient > 0 ? (val / totalByClient) * 100 : 0),
    ]);

  return renderPage(
    c,
    { title: "Analise de Receita", active: "finance-reports" },
    <>
      <PageHeader
        title="Analise de Receita"
        icon="ph-currency-dollar"
        actions={() => (
          <a href="/finance-reports" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />
      <div class="mb-6">
        <Panel title="Receita por Tipo de Honorario" icon="ph-hand-coins">
          <Table
            columns={[
              { label: "Tipo de honorario" },
              { label: "Total recebido", align: "right" },
              { label: "% do total", align: "right" },
            ]}
            rows={typeRows}
            emptyMsg="Nenhuma receita recebida encontrada."
            emptyIcon="ph-hand-coins"
            ariaLabel="Receita por tipo"
          />
        </Panel>
      </div>
      <Panel title="Top 10 Clientes por Receita" icon="ph-users">
        <Table
          columns={[
            { label: "Cliente" },
            { label: "Total recebido", align: "right" },
            { label: "% do total", align: "right" },
          ]}
          rows={clientRows}
          emptyMsg="Nenhuma receita por cliente encontrada."
          emptyIcon="ph-users"
          ariaLabel="Top 10 clientes por receita"
        />
      </Panel>
    </>,
  );
});

// --- GET /productivity -- productivity report ---

financeReportsRoutes.get("/productivity", async (c) => {
  const user = c.get("user");

  const { data: entries } = await supabase
    .from("time_entries")
    .select("duration_minutes, billable, hourly_rate_cents, profiles(full_name)")
    .eq("tenant_id", user.tenantId);

  const byUser: Record<string, { total: number; billable: number; value: number }> = {};
  for (const e of entries ?? []) {
    const name = (e.profiles as unknown as { full_name?: string } | null)?.full_name ?? "Sem usuario";
    if (!byUser[name]) byUser[name] = { total: 0, billable: 0, value: 0 };
    const dur = e.duration_minutes ?? 0;
    byUser[name].total += dur;
    if (e.billable) {
      byUser[name].billable += dur;
      const rate = e.hourly_rate_cents ?? 0;
      byUser[name].value += Math.round((dur / 60) * rate);
    }
  }

  const rows = Object.entries(byUser)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, d]) => [
      name,
      formatDuration(d.total),
      formatDuration(d.billable),
      formatCurrency(d.value),
    ]);

  return renderPage(
    c,
    { title: "Produtividade", active: "finance-reports" },
    <>
      <PageHeader
        title="Produtividade"
        icon="ph-clock-countdown"
        actions={() => (
          <a href="/finance-reports" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />
      <Panel title="Horas e Valor Faturavel por Usuario" icon="ph-clock-countdown">
        <Table
          columns={[
            { label: "Usuario" },
            { label: "Total horas", align: "right" },
            { label: "Horas faturaveis", align: "right" },
            { label: "Valor faturavel", align: "right" },
          ]}
          rows={rows}
          emptyMsg="Nenhum lancamento de horas encontrado."
          emptyIcon="ph-clock-countdown"
          ariaLabel="Relatorio de produtividade"
        />
      </Panel>
    </>,
  );
});

// --- GET /profitability — Analise de rentabilidade por processo ---

financeReportsRoutes.get("/profitability", async (c) => {
  const user = c.get("user");

  // Fetch honorarios (revenue) linked to cases.
  const [honorariosRes, timesheetRes, expensesRes] = await Promise.all([
    supabase
      .from("honorarios")
      .select("id, case_id, amount_cents, status, type, description, paid_at")
      .eq("tenant_id", user.tenantId)
      .not("case_id", "is", null),
    supabase
      .from("time_entries")
      .select("id, case_id, duration_minutes, billable, invoiced")
      .eq("tenant_id", user.tenantId)
      .not("case_id", "is", null),
    supabase
      .from("expenses")
      .select("id, case_id, amount_cents, category, description")
      .eq("tenant_id", user.tenantId)
      .not("case_id", "is", null),
  ]);

  // Fetch case details for the cases that have financial data.
  const caseIds = new Set<string>();
  for (const h of honorariosRes.data ?? []) if (h.case_id) caseIds.add(h.case_id);
  for (const t of timesheetRes.data ?? []) if (t.case_id) caseIds.add(t.case_id);
  for (const e of expensesRes.data ?? []) if (e.case_id) caseIds.add(e.case_id);

  const caseIdsArr = [...caseIds];
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number, status, clients(name)")
    .in("id", caseIdsArr.length > 0 ? caseIdsArr : ["00000000-0000-0000-0000-000000000000"]);

  const caseMap = new Map((cases ?? []).map((c) => [c.id, c]));

  // Cost rate per hour (configurable — default R$ 150/h = 250 cents/min).
  const costRatePerMinute = 250;

  // Aggregate per case.
  interface CaseProfitability {
    caseId: string;
    caseTitle: string;
    caseNumber: string;
    clientName: string;
    status: string;
    revenue: number;          // total honorarios paid (cents)
    revenuePending: number;   // honorarios pending (cents)
    hoursBillable: number;    // billable hours (minutes)
    hoursTotal: number;       // total hours (minutes)
    expenses: number;         // direct expenses (cents)
    laborCost: number;        // estimated labor cost (cents)
    totalCost: number;        // expenses + labor cost
    profit: number;           // revenue - totalCost
    margin: number;           // profit / revenue * 100
  }

  const caseStats = new Map<string, CaseProfitability>();

  for (const caseId of caseIdsArr) {
    const caseData = caseMap.get(caseId);
    const client = caseData?.clients as unknown as { name: string } | null;
    caseStats.set(caseId, {
      caseId,
      caseTitle: caseData?.title ?? "—",
      caseNumber: caseData?.case_number ?? "—",
      clientName: client?.name ?? "—",
      status: caseData?.status ?? "—",
      revenue: 0,
      revenuePending: 0,
      hoursBillable: 0,
      hoursTotal: 0,
      expenses: 0,
      laborCost: 0,
      totalCost: 0,
      profit: 0,
      margin: 0,
    });
  }

  // Add revenue.
  for (const h of honorariosRes.data ?? []) {
    const stats = caseStats.get(h.case_id!);
    if (!stats) continue;
    if (h.status === "paid") {
      stats.revenue += h.amount_cents;
    } else if (h.status === "pending" || h.status === "overdue") {
      stats.revenuePending += h.amount_cents;
    }
  }

  // Add hours.
  for (const t of timesheetRes.data ?? []) {
    const stats = caseStats.get(t.case_id!);
    if (!stats) continue;
    const minutes = t.duration_minutes ?? 0;
    stats.hoursTotal += minutes;
    if (t.billable) {
      stats.hoursBillable += minutes;
      stats.laborCost += minutes * costRatePerMinute;
    }
  }

  // Add expenses.
  for (const e of expensesRes.data ?? []) {
    const stats = caseStats.get(e.case_id!);
    if (!stats) continue;
    stats.expenses += e.amount_cents;
  }

  // Calculate totals.
  const allStats = [...caseStats.values()];
  for (const s of allStats) {
    s.totalCost = s.expenses + s.laborCost;
    s.profit = s.revenue - s.totalCost;
    s.margin = s.revenue > 0 ? (s.profit / s.revenue) * 100 : 0;
  }

  // Sort by profit descending.
  allStats.sort((a, b) => b.profit - a.profit);

  // Summary totals.
  const totals = allStats.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.revenue,
      revenuePending: acc.revenuePending + s.revenuePending,
      hoursBillable: acc.hoursBillable + s.hoursBillable,
      hoursTotal: acc.hoursTotal + s.hoursTotal,
      expenses: acc.expenses + s.expenses,
      laborCost: acc.laborCost + s.laborCost,
      totalCost: acc.totalCost + s.totalCost,
      profit: acc.profit + s.profit,
    }),
    { revenue: 0, revenuePending: 0, hoursBillable: 0, hoursTotal: 0, expenses: 0, laborCost: 0, totalCost: 0, profit: 0 },
  );
  const totalMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  // Build table rows.
  const rows = allStats.map((s) => [
    s.caseNumber,
    s.caseTitle.slice(0, 40),
    s.clientName,
    formatCurrency(s.revenue),
    formatCurrency(s.revenuePending),
    formatDuration(s.hoursBillable),
    formatCurrency(s.expenses),
    formatCurrency(s.laborCost),
    formatCurrency(s.profit),
    formatPercent(s.margin),
  ]);

  return renderPage(
    c,
    { title: "Rentabilidade por Processo", active: "finance-reports" },
    <>
      <PageHeader title="Rentabilidade por Processo" icon="ph-chart-line-up" />

      {/* Summary */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500">Receita Recebida</div>
          <div class="text-h2 font-bold text-status-green">{formatCurrency(totals.revenue)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Custo Total (Despesas + Horas)</div>
          <div class="text-h2 font-bold text-status-red">{formatCurrency(totals.totalCost)}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Lucro Liquido</div>
          <div class={`text-h2 font-bold ${totals.profit >= 0 ? "text-terracota-700" : "text-status-red"}`}>
            {formatCurrency(totals.profit)}
          </div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Margem Media</div>
          <div class="text-h2 font-bold text-status-blue">{formatPercent(totalMargin)}</div>
        </Panel>
      </div>

      {/* Detailed table */}
      <Panel>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold">Analise Detalhada</h2>
          <div class="text-body-sm text-gray-500">
            Custo de hora: {formatCurrency(costRatePerMinute * 60)}/h
          </div>
        </div>
        <Table
          columns={[
            { label: "Processo" },
            { label: "Caso" },
            { label: "Cliente" },
            { label: "Receita", align: "right" },
            { label: "Pendente", align: "right" },
            { label: "Horas Fat.", align: "right" },
            { label: "Despesas", align: "right" },
            { label: "Custo Horas", align: "right" },
            { label: "Lucro", align: "right" },
            { label: "Margem", align: "right" },
          ]}
          rows={rows}
          emptyMsg="Nenhum processo com dados financeiros encontrado."
          emptyIcon="ph-folder-open"
          ariaLabel="Rentabilidade por processo"
        />
      </Panel>

      {/* Insights */}
      <Panel>
        <h2 class="text-lg font-semibold mb-4">Insights</h2>
        <div class="space-y-3">
          {allStats.length > 0 && (
            <>
              <div class="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <i class="ph ph-trophy text-h3 text-status-green" aria-hidden="true"></i>
                <div>
                  <div class="font-medium">Processo mais rentavel</div>
                  <div class="text-sm text-gray-600">
                    {allStats[0]!.caseTitle} — {formatCurrency(allStats[0]!.profit)} ({formatPercent(allStats[0]!.margin)})
                  </div>
                </div>
              </div>

              {allStats.length > 1 && allStats[allStats.length - 1]!.profit < 0 && (
                <div class="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                  <i class="ph ph-warning text-h3 text-status-red" aria-hidden="true"></i>
                  <div>
                    <div class="font-medium">Processo em prejuizo</div>
                    <div class="text-sm text-gray-600">
                      {allStats[allStats.length - 1]!.caseTitle} — {formatCurrency(allStats[allStats.length - 1]!.profit)}
                    </div>
                  </div>
                </div>
              )}

              <div class="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <i class="ph ph-clock text-h3 text-status-blue" aria-hidden="true"></i>
                <div>
                  <div class="font-medium">Total de horas faturaveis</div>
                  <div class="text-sm text-gray-600">
                    {formatDuration(totals.hoursBillable)} em {allStats.length} processos
                  </div>
                </div>
              </div>

              {totals.revenuePending > 0 && (
                <div class="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                  <i class="ph ph-hourglass text-h3 text-yellow-600" aria-hidden="true"></i>
                  <div>
                    <div class="font-medium">Receita pendente</div>
                    <div class="text-sm text-gray-600">
                      {formatCurrency(totals.revenuePending)} em honorarios a receber
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Panel>
    </>,
  );
});
