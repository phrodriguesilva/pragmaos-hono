import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Table, Badge } from "../components/ui";

export const dashboardRoutes = new Hono<AppEnv>();

dashboardRoutes.use("*", requireAuth);

dashboardRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Stats: counts for the tenant.
  const [clients, cases, deadlines, hearings] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("deleted_at", null),
    supabase.from("cases").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).eq("status", "active").is("deleted_at", null),
    supabase.from("deadlines").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("completed_at", null).is("deleted_at", null),
    supabase.from("hearings").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId).is("deleted_at", null),
  ]);

  // Upcoming deadlines (next 5).
  const { data: upcomingDeadlines } = await supabase
    .from("deadlines")
    .select("id, title, due_date, cases(title)")
    .eq("tenant_id", user.tenantId)
    .is("completed_at", null)
    .is("deleted_at", null)
    .order("due_date", { ascending: true })
    .limit(5);

  // Upcoming hearings (next 5).
  const { data: upcomingHearings } = await supabase
    .from("hearings")
    .select("id, date, location, cases(title)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .gte("date", new Date().toISOString())
    .order("date", { ascending: true })
    .limit(5);

  return renderPage(
    c,
    { title: "Painel", active: "dashboard" },
    <>
      <PageHeader title="Painel" icon="ph-squares-four" />

      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500">
            <i class="ph ph-users text-h3 text-navy-600" aria-hidden="true" />
            Clientes
          </div>
          <div class="text-h1 font-bold text-navy-700">{clients.count ?? 0}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500">
            <i class="ph ph-folder-open text-h3 text-navy-600" aria-hidden="true" />
            Processos ativos
          </div>
          <div class="text-h1 font-bold text-navy-700">{cases.count ?? 0}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500">
            <i class="ph ph-clock-countdown text-h3 text-status-yellow" aria-hidden="true" />
            Prazos em aberto
          </div>
          <div class="text-h1 font-bold text-status-yellow">{deadlines.count ?? 0}</div>
        </Panel>
        <Panel>
          <div class="flex items-center gap-2 text-body-sm text-gray-500">
            <i class="ph ph-gavel text-h3 text-navy-600" aria-hidden="true" />
            Audiencias
          </div>
          <div class="text-h1 font-bold text-navy-700">{hearings.count ?? 0}</div>
        </Panel>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <Panel title="Proximos prazos" icon="ph-clock-countdown">
          <Table
            columns={[
              { label: "Prazo", icon: "ph-text-aa" },
              { label: "Processo", icon: "ph-folder" },
              { label: "Data", icon: "ph-calendar" },
            ]}
            rows={(upcomingDeadlines ?? []).map((d) => [
              d.title,
              (d.cases as unknown as { title: string } | null)?.title ?? "-",
              new Date(d.due_date).toLocaleDateString("pt-BR"),
            ])}
            emptyMsg="Nenhum prazo em aberto."
            emptyIcon="ph-check-circle"
          />
        </Panel>
        <Panel title="Proximas audiencias" icon="ph-gavel">
          <Table
            columns={[
              { label: "Processo", icon: "ph-folder" },
              { label: "Data", icon: "ph-calendar" },
              { label: "Local", icon: "ph-map-pin" },
            ]}
            rows={(upcomingHearings ?? []).map((h) => [
              (h.cases as unknown as { title: string } | null)?.title ?? "-",
              new Date(h.date).toLocaleString("pt-BR"),
              h.location ?? "-",
            ])}
            emptyMsg="Nenhuma audiencia agendada."
            emptyIcon="ph-calendar-blank"
          />
        </Panel>
      </div>
    </>,
  );
});
