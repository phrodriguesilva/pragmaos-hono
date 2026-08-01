import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Table, Badge } from "../components/ui";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.use("*", requireAuth);

// KPI card component.
function KpiCard({ icon, label, value, color, trend }: {
  icon: string; label: string; value: string | number; color: string; trend?: string;
}) {
  return (
    <Panel>
      <div class="flex items-center justify-between mb-1">
        <div class={`flex items-center gap-2 text-body-sm text-gray-500`}>
          <i class={`ph ${icon} text-h3 ${color}`} aria-hidden="true" />
          {label}
        </div>
        {trend ? <span class="text-body-sm text-gray-400">{trend}</span> : null}
      </div>
      <div class={`text-h1 font-bold ${color}`}>{value}</div>
    </Panel>
  );
}

// Simple CSS bar chart.
function BarChart({ data, color }: {
  data: { label: string; value: number }[]; color: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div class="flex items-end gap-2 h-32 mt-2">
      {data.map((d) => (
        <div class="flex-1 flex flex-col items-center gap-1">
          <div class="text-body-sm text-gray-500">{d.value}</div>
          <div
            class={`w-full ${color} rounded-t`}
            style={`height:${Math.max((d.value / max) * 80, 2)}px`}
            title={`${d.label}: ${d.value}`}
          />
          <div class="text-body-sm text-gray-400 truncate w-full text-center">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

dashboardRoutes.get("/", async (c) => {
  const user = c.get("user");
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  // Run all count queries in parallel.
  const [
    clientsCount, casesActive, casesNewThisMonth, casesArchived,
    hearingsToday, deadlinesCritical, tasksOverdue,
    honorariosToReceive, honorariosReceived, leadsOpen, tasksPending,
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("deleted_at", null),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).eq("status", "active").is("deleted_at", null),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).gte("created_at", startOfMonth).is("deleted_at", null),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).eq("status", "archived").is("deleted_at", null),
    supabase.from("hearings").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("deleted_at", null).gte("date", startOfToday).lt("date", endOfToday),
    supabase.from("deadlines").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("completed_at", null).is("deleted_at", null).lte("due_date", threeDaysFromNow),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).neq("status", "done").is("deleted_at", null).lt("due_date", now.toISOString()),
    supabase.from("honorarios").select("amount_cents", { count: "exact", head: false }).eq("tenant_id", user.tenantId).eq("status", "pending"),
    supabase.from("honorarios").select("amount_cents", { count: "exact", head: false }).eq("tenant_id", user.tenantId).eq("status", "paid"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("deleted_at", null).neq("status", "cliente").neq("status", "perdido"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).neq("status", "done").is("deleted_at", null),
  ]);

  // Calculate honorarios totals.
  const toReceiveCents = (honorariosToReceive.data ?? []).reduce((sum, h: any) => sum + (h.amount_cents ?? 0), 0);
  const receivedCents = (honorariosReceived.data ?? []).reduce((sum, h: any) => sum + (h.amount_cents ?? 0), 0);
  const fmt = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

  // Widgets: agenda do dia, ultimas movimentacoes, ultimos documentos, ultimos clientes.
  const [agendaHearings, agendaDeadlines, recentMovements, recentDocs, recentClients, casesByType, casesByStatus] = await Promise.all([
    supabase.from("hearings").select("id, date, location, case_id, cases(title)").eq("tenant_id", user.tenantId).is("deleted_at", null).gte("date", startOfToday).lt("date", endOfToday).order("date", { ascending: true }).limit(5),
    supabase.from("deadlines").select("id, title, due_date, case_id, cases(title)").eq("tenant_id", user.tenantId).is("completed_at", null).is("deleted_at", null).gte("due_date", startOfToday).order("due_date", { ascending: true }).limit(5),
    supabase.from("proceeding_movements").select("id, movement_text, movement_date, proceedings(cnj_number)").eq("tenant_id", user.tenantId).is("deleted_at", null).order("movement_date", { ascending: false }).limit(5),
    supabase.from("documents").select("id, title, doc_type, created_at").eq("tenant_id", user.tenantId).order("created_at", { ascending: false }).limit(5),
    supabase.from("clients").select("id, name, created_at").eq("tenant_id", user.tenantId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    supabase.from("cases").select("case_type").eq("tenant_id", user.tenantId).is("deleted_at", null),
    supabase.from("cases").select("status").eq("tenant_id", user.tenantId).is("deleted_at", null),
  ]);

  // Aggregate chart data.
  const typeMap: Record<string, number> = {};
  for (const cs of casesByType.data ?? []) {
    typeMap[cs.case_type] = (typeMap[cs.case_type] ?? 0) + 1;
  }
  const typeChart = Object.entries(typeMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  const statusMap: Record<string, number> = { active: 0, suspended: 0, archived: 0 };
  for (const cs of casesByStatus.data ?? []) {
    statusMap[cs.status] = (statusMap[cs.status] ?? 0) + 1;
  }
  const statusChart = [
    { label: "Ativos", value: statusMap.active ?? 0 },
    { label: "Susp.", value: statusMap.suspended ?? 0 },
    { label: "Arquiv.", value: statusMap.archived ?? 0 },
  ];

  return renderPage(
    c,
    { title: "Painel", active: "dashboard" },
    <>
      <PageHeader title="Painel Executivo" icon="ph-squares-four" />

      {/* Row 1: KPIs principais */}
      <div class="grid grid-cols-5 gap-3 mb-4">
        <KpiCard icon="ph-folder-open" label="Processos ativos" value={casesActive.count ?? 0} color="text-navy-700" />
        <KpiCard icon="ph-folder-plus" label="Novos no mes" value={casesNewThisMonth.count ?? 0} color="text-status-green" trend="este mes" />
        <KpiCard icon="ph-folder-dashed" label="Encerrados" value={casesArchived.count ?? 0} color="text-gray-500" />
        <KpiCard icon="ph-gavel" label="Audiencias hoje" value={hearingsToday.count ?? 0} color="text-navy-700" />
        <KpiCard icon="ph-clock-countdown" label="Prazos criticos" value={deadlinesCritical.count ?? 0} color="text-status-red" trend="3 dias" />
      </div>

      {/* Row 2: KPIs financeiros e operacionais */}
      <div class="grid grid-cols-5 gap-3 mb-6">
        <KpiCard icon="ph-hand-coins" label="A receber" value={fmt(toReceiveCents)} color="text-status-yellow" />
        <KpiCard icon="ph-check-circle" label="Recebido" value={fmt(receivedCents)} color="text-status-green" />
        <KpiCard icon="ph-users" label="Clientes ativos" value={clientsCount.count ?? 0} color="text-navy-700" />
        <KpiCard icon="ph-user-plus" label="Leads em aberto" value={leadsOpen.count ?? 0} color="text-blue-600" />
        <KpiCard icon="ph-check-square" label="Tarefas pendentes" value={tasksPending.count ?? 0} color="text-status-yellow" />
      </div>

      {/* Row 3: Graficos */}
      <div class="grid grid-cols-2 gap-4 mb-6">
        <Panel title="Processos por area" icon="ph-tag">
          {typeChart.length > 0 ? (
            <BarChart data={typeChart} color="bg-navy-500" />
          ) : (
            <div class="text-body-sm text-gray-400 py-8 text-center">
              <i class="ph ph-chart-bar text-h2 block mb-1 text-gray-300" aria-hidden="true" />
              Sem dados suficientes.
            </div>
          )}
        </Panel>
        <Panel title="Processos por status" icon="ph-circle-half">
          <BarChart data={statusChart} color="bg-navy-600" />
        </Panel>
      </div>

      {/* Row 4: Widgets */}
      <div class="grid grid-cols-2 gap-4 mb-6">
        {/* Agenda do dia */}
        <Panel title="Agenda de hoje" icon="ph-calendar">
          <div class="flex flex-col gap-3">
            <div>
              <div class="text-body-sm font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <i class="ph ph-gavel text-status-red" aria-hidden="true" /> Audiencias
              </div>
              {(agendaHearings.data ?? []).length === 0 ? (
                <div class="text-body-sm text-gray-400 pl-5">Nenhuma audiencia hoje.</div>
              ) : (
                <ul class="flex flex-col gap-1 pl-5">
                  {(agendaHearings.data ?? []).map((h) => (
                    <li class="text-body-sm text-gray-700 flex items-center gap-2">
                      <i class="ph ph-clock text-xs text-gray-400" aria-hidden="true" />
                      {new Date(h.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      <a href={`/cases/${h.case_id}`} class="text-navy-700 hover:underline">
                        {(h.cases as unknown as { title: string } | null)?.title ?? "-"}
                      </a>
                      {h.location ? <span class="text-gray-400">- {h.location}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div class="text-body-sm font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <i class="ph ph-clock-countdown text-status-yellow" aria-hidden="true" /> Prazos
              </div>
              {(agendaDeadlines.data ?? []).length === 0 ? (
                <div class="text-body-sm text-gray-400 pl-5">Nenhum prazo para hoje.</div>
              ) : (
                <ul class="flex flex-col gap-1 pl-5">
                  {(agendaDeadlines.data ?? []).map((d) => (
                    <li class="text-body-sm text-gray-700 flex items-center gap-2">
                      <i class="ph ph-calendar text-xs text-gray-400" aria-hidden="true" />
                      {new Date(d.due_date).toLocaleDateString("pt-BR")}
                      <a href={`/cases/${d.case_id}`} class="text-navy-700 hover:underline">{d.title}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        {/* Ultimas movimentacoes */}
        <Panel title="Ultimas movimentacoes" icon="ph-list-dashes">
          {(recentMovements.data ?? []).length === 0 ? (
            <div class="text-body-sm text-gray-400 py-4 text-center">
              <i class="ph ph-inbox text-h2 block mb-1 text-gray-300" aria-hidden="true" />
              Nenhuma movimentacao recente.
            </div>
          ) : (
            <ul class="flex flex-col gap-2">
              {(recentMovements.data ?? []).map((m) => (
                <li class="text-body-sm border-b border-border pb-1 last:border-0">
                  <div class="flex items-center gap-2 text-gray-400 mb-1">
                    <i class="ph ph-calendar text-xs" aria-hidden="true" />
                    {new Date(m.movement_date).toLocaleDateString("pt-BR")}
                    <span class="text-navy-600 font-semibold">
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

      {/* Row 5: Ultimos documentos e clientes */}
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Ultimos documentos" icon="ph-file-text">
          {(recentDocs.data ?? []).length === 0 ? (
            <div class="text-body-sm text-gray-400 py-4 text-center">
              <i class="ph ph-file-text text-h2 block mb-1 text-gray-300" aria-hidden="true" />
              Nenhum documento recente.
            </div>
          ) : (
            <ul class="flex flex-col gap-2">
              {(recentDocs.data ?? []).map((d) => (
                <li class="text-body-sm flex items-center gap-2 border-b border-border pb-1 last:border-0">
                  <i class="ph ph-file text-gray-400" aria-hidden="true" />
                  <span class="text-gray-700 font-semibold">{d.title}</span>
                  <Badge color="gray">{d.doc_type}</Badge>
                  <span class="text-gray-400 ml-auto">{new Date(d.created_at).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Ultimos clientes" icon="ph-users">
          {(recentClients.data ?? []).length === 0 ? (
            <div class="text-body-sm text-gray-400 py-4 text-center">
              <i class="ph ph-users text-h2 block mb-1 text-gray-300" aria-hidden="true" />
              Nenhum cliente recente.
            </div>
          ) : (
            <ul class="flex flex-col gap-2">
              {(recentClients.data ?? []).map((cl) => (
                <li class="text-body-sm flex items-center gap-2 border-b border-border pb-1 last:border-0">
                  <i class="ph ph-user-circle text-gray-400" aria-hidden="true" />
                  <a href={`/clients/${cl.id}`} class="text-navy-700 hover:underline font-semibold">{cl.name}</a>
                  <span class="text-gray-400 ml-auto">{new Date(cl.created_at).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>,
  );
});
