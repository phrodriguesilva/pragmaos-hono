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
      <PageHeader title="Painel" />

      <div class="grid grid-cols-4 gap-4 mb-6">
        <Panel>
          <div class="text-body-sm text-gray-500">Clientes</div>
          <div class="text-h1 font-bold text-navy-700">{clients.count ?? 0}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Processos ativos</div>
          <div class="text-h1 font-bold text-navy-700">{cases.count ?? 0}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Prazos em aberto</div>
          <div class="text-h1 font-bold text-status-yellow">{deadlines.count ?? 0}</div>
        </Panel>
        <Panel>
          <div class="text-body-sm text-gray-500">Audiencias</div>
          <div class="text-h1 font-bold text-navy-700">{hearings.count ?? 0}</div>
        </Panel>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <Panel title="Proximos prazos">
          <Table
            columns={[
              { label: "Prazo" },
              { label: "Processo" },
              { label: "Data" },
            ]}
            rows={(upcomingDeadlines ?? []).map((d) => [
              d.title,
              (d.cases as unknown as { title: string } | null)?.title ?? "-",
              new Date(d.due_date).toLocaleDateString("pt-BR"),
            ])}
            emptyMsg="Nenhum prazo em aberto."
          />
        </Panel>
        <Panel title="Proximas audiencias">
          <Table
            columns={[
              { label: "Processo" },
              { label: "Data" },
              { label: "Local" },
            ]}
            rows={(upcomingHearings ?? []).map((h) => [
              (h.cases as unknown as { title: string } | null)?.title ?? "-",
              new Date(h.date).toLocaleString("pt-BR"),
              h.location ?? "-",
            ])}
            emptyMsg="Nenhuma audiencia agendada."
          />
        </Panel>
      </div>
    </>,
  );
});
