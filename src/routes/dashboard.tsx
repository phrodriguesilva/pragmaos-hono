import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth, requireActiveTenant } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Badge, EmptyState } from "../components/ui";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.use("*", requireAuth);
dashboardRoutes.use("*", requireActiveTenant);

// ============================================================
// SVG Chart Components — pure SVG, no external dependencies
// ============================================================

// Donut chart — for status distribution (3-5 categories).
function DonutChart({ data, size = 160 }: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2 - 20;
  const innerRadius = radius * 0.62;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((d) => {
    const fraction = total > 0 ? d.value / total : 0;
    const dash = fraction * circumference;
    const seg = { ...d, dash, offset, fraction };
    offset += dash;
    return seg;
  });

  return (
    <div class="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--color-gray-200)" stroke-width={radius - innerRadius} />
        ) : (
          segments.map((s) => (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={s.color}
              stroke-width={radius - innerRadius}
              stroke-dasharray={`${s.dash} ${circumference - s.dash}`}
              stroke-dashoffset={-s.offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{`${s.label}: ${s.value} (${Math.round(s.fraction * 100)}%)`}</title>
            </circle>
          ))
        )}
        <text x={cx} y={cy - 4} text-anchor="middle" class="fill-gray-800" style="font-size:22px;font-weight:700">
          {total}
        </text>
        <text x={cx} y={cy + 14} text-anchor="middle" class="fill-gray-400" style="font-size:12px">
          Total
        </text>
      </svg>
      <div class="flex flex-col gap-2">
        {data.map((d) => (
          <div class="flex items-center gap-2 text-body-sm">
            <span class="w-3 h-3 rounded-sm" style={`background:${d.color}`} />
            <span class="text-gray-600">{d.label}</span>
            <span class="text-gray-800 font-semibold ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Line/area chart — for revenue trend over months.
function LineChart({ data, height = 140 }: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const width = 320;
  const pad = { top: 10, right: 10, bottom: 24, left: 10 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = chartW / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => ({
    x: pad.left + i * stepX,
    y: pad.top + chartH - (d.value / max) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? pad.left} ${pad.top + chartH} L ${points[0]?.x ?? pad.left} ${pad.top + chartH} Z`;
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-carvao-400)" stop-opacity="0.25" />
          <stop offset="100%" stop-color="var(--color-carvao-400)" stop-opacity="0" />
        </linearGradient>
      </defs>
      {/* Horizontal grid lines */}
      {[0, 0.5, 1].map((t) => (
        <line
          x1={pad.left} y1={pad.top + chartH * t}
          x2={pad.left + chartW} y2={pad.top + chartH * t}
          stroke="var(--color-gray-200)" stroke-width="1"
        />
      ))}
      {/* Area fill */}
      <path d={areaPath} fill="url(#revGrad)" />
      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--color-carvao-500)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      {/* Points */}
      {points.map((p) => (
        <g>
          <circle cx={p.x} cy={p.y} r="3.5" fill="var(--color-carvao-500)" />
          <text x={p.x} y={p.y - 8} text-anchor="middle" class="fill-gray-600" style="font-size:12px;font-weight:600">
            {fmtK(p.value)}
          </text>
        </g>
      ))}
      {/* X labels */}
      {points.map((p) => (
        <text x={p.x} y={height - 6} text-anchor="middle" class="fill-gray-400" style="font-size:12px">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

// Colored bar chart — each bar has its own color.
function BarChart({ data, height = 140 }: {
  data: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = 36;
  const gap = 12;
  const totalW = data.length * (barW + gap) + gap;
  const pad = { top: 16, bottom: 28 };
  const chartH = height - pad.top - pad.bottom;

  return (
    <svg width={totalW} height={height} viewBox={`0 0 ${totalW} ${height}`}>
      {data.map((d, i) => {
        const x = gap + i * (barW + gap);
        const barH = Math.max((d.value / max) * chartH, 2);
        const y = pad.top + chartH - barH;
        return (
          <g>
            <rect x={x} y={y} width={barW} height={barH} rx="4" fill={d.color}>
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            <text x={x + barW / 2} y={y - 4} text-anchor="middle" class="fill-gray-700" style="font-size:12px;font-weight:600">
              {d.value}
            </text>
            <text x={x + barW / 2} y={height - 8} text-anchor="middle" class="fill-gray-500" style="font-size:12px">
              {d.label.length > 8 ? d.label.slice(0, 7) + "…" : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// KPI card — modern, with icon in colored box.
function KpiCard({ icon, label, value, color, sub }: {
  icon: string; label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <Panel hover>
      <div class="flex items-center gap-3">
        <div class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0`} style={`background:${color}15`}>
          <i class={`ph ${icon} text-h3`} style={`color:${color}`} aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <div class="text-body-xs text-gray-500 font-medium uppercase tracking-wide truncate">{label}</div>
          <div class="text-h2 font-bold text-gray-800 leading-tight">{value ?? 0}</div>
          {sub ? <div class="text-body-xs text-gray-400">{sub}</div> : null}
        </div>
      </div>
    </Panel>
  );
}

// ============================================================
// Dashboard route
// ============================================================

// Legacy redirect: / -> /dashboard (the root now serves the marketing landing page).
dashboardRoutes.get("/", (c) => c.redirect("/dashboard"));

dashboardRoutes.get("/dashboard", async (c) => {
  const user = c.get("user");
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // Phase 1: KPI counts + aggregated data — all in parallel via RPC + head queries.
  const [
    casesActive, hearingsToday, deadlinesCritical,
    pendingTotal, revenue6m, caseCounts,
  ] = await Promise.all([
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).eq("status", "active").is("deleted_at", null),
    supabase.from("hearings").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("deleted_at", null).gte("date", startOfToday).lt("date", endOfToday),
    supabase.from("deadlines").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("completed_at", null).is("deleted_at", null).lte("due_date", threeDaysFromNow),
    // RPC: sum of pending honorarios (server-side, no row transfer).
    supabase.rpc("dashboard_pending_honorarios_total", { p_tenant: user.tenantId }),
    // RPC: revenue by month for last 6 months (server-side GROUP BY).
    supabase.rpc("dashboard_revenue_6m", { p_tenant: user.tenantId, p_now: now.toISOString() }),
    // RPC: case counts grouped by type + status (single query instead of two full-table fetches).
    supabase.rpc("dashboard_case_counts", { p_tenant: user.tenantId }),
  ]);

  // Calculate financial totals from RPC results.
  const toReceiveCents = (pendingTotal.data as unknown as number) ?? 0;
  const fmt = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  // Revenue by month (last 6 months) from RPC.
  const monthLabels: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push(d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
  }
  const revenueByMonth = [0, 0, 0, 0, 0, 0];
  for (const row of (revenue6m.data as unknown as { month_index: number; total_cents: number }[]) ?? []) {
    if (row.month_index >= 0 && row.month_index <= 5) {
      revenueByMonth[row.month_index] = row.total_cents ?? 0;
    }
  }
  const revenueChart = monthLabels.map((label, i) => ({ label, value: Math.round(revenueByMonth[i]! / 100) }));

  // Aggregate case type + status data from single RPC query.
  const typeMap: Record<string, number> = {};
  const statusMap: Record<string, number> = { active: 0, suspended: 0, archived: 0 };
  for (const row of (caseCounts.data as unknown as { case_type: string; status: string; cnt: number }[]) ?? []) {
    typeMap[row.case_type] = (typeMap[row.case_type] ?? 0) + Number(row.cnt);
    statusMap[row.status] = (statusMap[row.status] ?? 0) + Number(row.cnt);
  }
  const typeLabels: Record<string, string> = {
    civel: "Civel", trabalhista: "Trabalhista", criminal: "Criminal",
    empresarial: "Empresarial", familia: "Familia", tributario: "Tributario",
    previdenciario: "Previd.", consumidor: "Consumidor",
  };
  const typeColors = ["#0568ff", "#4d8bff", "#4d8bff", "#6b7290", "#4a5470", "#e6efff"];
  const typeChart = Object.entries(typeMap)
    .map(([key, value]) => ({ label: typeLabels[key] ?? key, value, color: typeColors[0] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((d, i) => ({ ...d, color: typeColors[i % typeColors.length] ?? "#0568ff" }));

  const statusChart = [
    { label: "Ativos", value: statusMap.active ?? 0, color: "#0568ff" },
    { label: "Suspensos", value: statusMap.suspended ?? 0, color: "#4d8bff" },
    { label: "Arquivados", value: statusMap.archived ?? 0, color: "#dce0e8" },
  ];

  // Phase 2: Widgets — agenda + recent movements.
  const [agendaHearings, agendaDeadlines, recentMovements] = await Promise.all([
    supabase.from("hearings").select("id, date, location, case_id, cases(title)").eq("tenant_id", user.tenantId).is("deleted_at", null).gte("date", startOfToday).lt("date", endOfToday).order("date", { ascending: true }).limit(5),
    supabase.from("deadlines").select("id, title, due_date, case_id, cases(title)").eq("tenant_id", user.tenantId).is("completed_at", null).is("deleted_at", null).gte("due_date", startOfToday).order("due_date", { ascending: true }).limit(5),
    supabase.from("proceeding_movements").select("id, movement_text, movement_date, proceedings(cnj_number)").eq("tenant_id", user.tenantId).is("deleted_at", null).order("movement_date", { ascending: false }).limit(6),
  ]);

  return renderPage(
    c,
    { title: "Painel", active: "dashboard" },
    <>
      <PageHeader title="Painel Executivo" icon="ph-squares-four" />

      {/* Row 1: 4 KPIs principais */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="fade-in-up" style="animation-delay:0ms"><KpiCard icon="ph-folder-open" label="Processos ativos" value={casesActive.count ?? 0} color="#0568ff" /></div>
        <div class="fade-in-up" style="animation-delay:60ms"><KpiCard icon="ph-hand-coins" label="A receber" value={fmt(toReceiveCents)} color="#94640c" /></div>
        <div class="fade-in-up" style="animation-delay:120ms"><KpiCard icon="ph-gavel" label="Audiencias hoje" value={hearingsToday.count ?? 0} color="#4d8bff" /></div>
        <div class="fade-in-up" style="animation-delay:180ms"><KpiCard icon="ph-clock-countdown" label="Prazos criticos" value={deadlinesCritical.count ?? 0} color="#ba1a1a" sub="proximos 3 dias" /></div>
      </div>

      {/* Row 2: 3 graficos */}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Panel title="Processos por status" icon="ph-circle-half">
          <div class="py-2">
            <DonutChart data={statusChart} />
          </div>
        </Panel>
        <Panel title="Processos por area" icon="ph-tag">
          {typeChart.length > 0 ? (
            <div class="py-2 overflow-x-auto">
              <BarChart data={typeChart} />
            </div>
          ) : (
            <div class="text-body-sm text-gray-400 py-8 text-center">
              <i class="ph ph-chart-bar text-h2 block mb-1 text-gray-300" aria-hidden="true" />
              Sem dados suficientes.
            </div>
          )}
        </Panel>
        <Panel title="Receita (6 meses)" icon="ph-chart-line-up">
          <div class="py-2">
            <LineChart data={revenueChart} />
          </div>
        </Panel>
      </div>

      {/* Row 3: Agenda + Movimentacoes */}
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Agenda" icon="ph-calendar" action={<a href="/calendar" class="text-body-sm text-[#0568ff] hover:underline">Ver agenda</a>}>
          <div class="flex flex-col gap-4">
            <div>
              <div class="text-body-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                <i class="ph ph-gavel text-status-red" aria-hidden="true" /> Audiencias de hoje
              </div>
              {(agendaHearings.data ?? []).length === 0 ? (
                <EmptyState icon="ph-gavel" title="Nenhuma audiencia hoje" description="Suas audiencias aparecerao aqui automaticamente." />
              ) : (
                <ul class="flex flex-col gap-1.5 pl-5">
                  {(agendaHearings.data ?? []).map((h) => (
                    <li class="text-body-sm text-gray-700 flex items-center gap-2">
                      <i class="ph ph-clock text-xs text-gray-400" aria-hidden="true" />
                      {new Date(h.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      <a href={`/cases/${h.case_id}`} class="text-[#0568ff] hover:underline">
                        {(h.cases as unknown as { title: string } | null)?.title ?? "-"}
                      </a>
                      {h.location ? <span class="text-gray-400">- {h.location}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div class="text-body-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                <i class="ph ph-clock-countdown text-status-yellow" aria-hidden="true" /> Proximos prazos
              </div>
              {(agendaDeadlines.data ?? []).length === 0 ? (
                <EmptyState icon="ph-calendar" title="Nenhum prazo proximo" description="Prazos pendentes aparecerao aqui." />
              ) : (
                <ul class="flex flex-col gap-1.5 pl-5">
                  {(agendaDeadlines.data ?? []).map((d) => (
                    <li class="text-body-sm text-gray-700 flex items-center gap-2">
                      <i class="ph ph-calendar text-xs text-gray-400" aria-hidden="true" />
                      {new Date(d.due_date).toLocaleDateString("pt-BR")}
                      <a href={`/cases/${d.case_id}`} class="text-[#0568ff] hover:underline">{d.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Ultimas movimentacoes" icon="ph-list-dashes" action={<a href="/proceedings" class="text-body-sm text-[#0568ff] hover:underline">Ver todos</a>}>
          {(recentMovements.data ?? []).length === 0 ? (
            <EmptyState icon="ph-tray" title="Nenhuma movimentacao recente" description="Movimentacoes dos seus processos aparecerao aqui." />
          ) : (
            <ul class="flex flex-col gap-2.5">
              {(recentMovements.data ?? []).map((m) => (
                <li class="text-body-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                  <div class="flex items-center gap-2 text-gray-400 mb-1">
                    <i class="ph ph-calendar text-xs" aria-hidden="true" />
                    {new Date(m.movement_date).toLocaleDateString("pt-BR")}
                    <span class="text-gray-600 font-semibold">
                      {(m.proceedings as unknown as { cnj_number: string } | null)?.cnj_number ?? ""}
                    </span>
                  </div>
                  <div class="text-gray-700 truncate">{m.movement_text}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>,
  );
});
