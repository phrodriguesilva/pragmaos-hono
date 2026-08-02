import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { calculateJurimetry, type JurimetryReport } from "../lib/jurimetry";
import { PageHeader, Panel, Select, Badge, Table, type TableColumn } from "../components/ui";

export const jurimetryRoutes = new Hono<AppEnv>();

jurimetryRoutes.use("*", requireAuth);
jurimetryRoutes.use("*", requireRole("socio", "admin"));

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function formatPercent(value: number): string {
  if (!isFinite(value)) return "0,00%";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + "%";
}

const monthNames = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

// GET / — jurimetry dashboard.
jurimetryRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Filters.
  const area = c.req.query("area") ?? "";
  const lawyerId = c.req.query("lawyer") ?? "";

  // Fetch lawyers for filter dropdown.
  const { data: lawyers } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tenant_id", user.tenantId)
    .order("full_name");

  // Fetch areas for filter dropdown.
  const { data: areas } = await supabase
    .from("cases")
    .select("area")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .not("area", "is", null);

  const uniqueAreas = [...new Set((areas ?? []).map((a) => a.area).filter(Boolean))] as string[];

  // Calculate report.
  const report = await calculateJurimetry(user.tenantId, {
    area: area || undefined,
    lawyerId: lawyerId || undefined,
  });

  // Build outcome table.
  const outcomeColumns: TableColumn[] = [
    { label: "Resultado" },
    { label: "Casos", align: "right" },
    { label: "%", align: "right" },
  ];
  const outcomeRows = report.outcomeDistribution.map((o) => [
    o.outcome,
    String(o.count),
    formatPercent(o.percentage),
  ]);

  // Build area table.
  const areaColumns: TableColumn[] = [
    { label: "Area" },
    { label: "Casos", align: "right" },
    { label: "Taxa de Exito", align: "right" },
  ];
  const areaRows = report.areaDistribution.map((a) => [
    a.area,
    String(a.count),
    formatPercent(a.successRate),
  ]);

  // Build lawyer table.
  const lawyerColumns: TableColumn[] = [
    { label: "Advogado" },
    { label: "Casos", align: "right" },
    { label: "Taxa de Exito", align: "right" },
  ];
  const lawyerRows = report.topLawyers.map((l) => [
    l.lawyerName,
    String(l.cases),
    formatPercent(l.successRate),
  ]);

  // Build monthly trend data for simple bar chart.
  const maxMonthly = Math.max(...report.monthlyTrend.map((m) => Math.max(m.filed, m.closed)), 1);

  return renderPage(
    c,
    { title: "Jurimetria Interna", active: "jurimetry" },
    <>
      <PageHeader title="Jurimetria Interna" icon="ph-chart-scatter" />

      {/* Filters */}
      <form method="get" class="flex items-end gap-3 mb-6">
        <Select
          label="Area"
          id="area"
          name="area"
          options={[{ value: "", label: "Todas" }, ...uniqueAreas.map((a) => ({ value: a, label: a }))]}
          selected={area}
        />
        <Select
          label="Advogado"
          id="lawyer"
          name="lawyer"
          options={[{ value: "", label: "Todos" }, ...(lawyers ?? []).map((l) => ({ value: l.id, label: l.full_name }))]}
          selected={lawyerId}
        />
        <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
          <i class="ph ph-funnel" aria-hidden="true"></i>Filtrar
        </button>
      </form>

      {/* Summary stats */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500">Total de Casos</div>
          <div class="text-h2 font-bold text-carvao-800">{report.totalCases}</div>
          <div class="text-xs text-gray-400 mt-1">{report.activeCases} ativos, {report.closedCases} encerrados</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Taxa de Exito</div>
          <div class="text-h2 font-bold text-status-green">{formatPercent(report.successRate)}</div>
          <div class="text-xs text-gray-400 mt-1">{report.closedCases} casos encerrados</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Duracao Media</div>
          <div class="text-h2 font-bold text-status-blue">{report.avgDurationDays} dias</div>
          <div class="text-xs text-gray-400 mt-1">Mediana: {report.medianDurationDays} dias</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Taxa de Recuperacao</div>
          <div class="text-h2 font-bold text-terracota-700">{formatPercent(report.valueAnalysis.recoveryRate)}</div>
          <div class="text-xs text-gray-400 mt-1">
            {formatCurrency(report.valueAnalysis.totalRecovered)} / {formatCurrency(report.valueAnalysis.totalClaimed)}
          </div>
        </Panel>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Outcome distribution */}
        <Panel>
          <h2 class="text-lg font-semibold mb-4">Distribuicao de Resultados</h2>
          {outcomeRows.length > 0 ? (
            <Table columns={outcomeColumns} rows={outcomeRows} emptyMsg="Sem dados" ariaLabel="Resultados" />
          ) : (
            <p class="text-gray-500 text-sm">Nenhum caso encerrado ainda.</p>
          )}
        </Panel>

        {/* Area distribution */}
        <Panel>
          <h2 class="text-lg font-semibold mb-4">Por Area do Direito</h2>
          {areaRows.length > 0 ? (
            <Table columns={areaColumns} rows={areaRows} emptyMsg="Sem dados" ariaLabel="Areas" />
          ) : (
            <p class="text-gray-500 text-sm">Nenhuma area definida.</p>
          )}
        </Panel>
      </div>

      {/* Monthly trend */}
      <Panel>
        <h2 class="text-lg font-semibold mb-4">Tendencia Mensal (12 meses)</h2>
        <div class="flex items-end justify-between gap-1 h-40">
          {report.monthlyTrend.map((m) => {
            const [year, month] = m.month.split("-");
            const monthIdx = parseInt(month ?? "1", 10) - 1;
            const filedHeight = (m.filed / maxMonthly) * 100;
            const closedHeight = (m.closed / maxMonthly) * 100;
            return (
              <div key={m.month} class="flex-1 flex flex-col items-center gap-1">
                <div class="flex items-end gap-0.5 h-32 w-full justify-center">
                  <div class="w-3 bg-blue-500 rounded-t" style={`height: ${filedHeight}%`} title={`Distribuidos: ${m.filed}`}></div>
                  <div class="w-3 bg-green-500 rounded-t" style={`height: ${closedHeight}%`} title={`Encerrados: ${m.closed}`}></div>
                </div>
                <div class="text-xs text-gray-500">{monthNames[monthIdx] ?? ""}</div>
              </div>
            );
          })}
        </div>
        <div class="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <div class="flex items-center gap-1"><div class="w-3 h-3 bg-blue-500 rounded"></div>Distribuidos</div>
          <div class="flex items-center gap-1"><div class="w-3 h-3 bg-green-500 rounded"></div>Encerrados</div>
        </div>
      </Panel>

      {/* Top lawyers */}
      <Panel>
        <h2 class="text-lg font-semibold mb-4">Advogados por Taxa de Exito</h2>
        {lawyerRows.length > 0 ? (
          <Table columns={lawyerColumns} rows={lawyerRows} emptyMsg="Sem dados suficientes" ariaLabel="Advogados" />
        ) : (
          <p class="text-gray-500 text-sm">Nenhum advogado com casos suficientes (minimo 2).</p>
        )}
      </Panel>
    </>,
  );
});
