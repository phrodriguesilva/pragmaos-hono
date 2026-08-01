import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Table, Badge } from "../components/ui";

export const reportsRoutes = new Hono<AppEnv>();

reportsRoutes.use("*", requireAuth);

reportsRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Case status distribution.
  const { data: casesByStatus } = await supabase
    .from("cases")
    .select("status")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null);

  const statusCount: Record<string, number> = {};
  for (const cs of casesByStatus ?? []) {
    statusCount[cs.status] = (statusCount[cs.status] ?? 0) + 1;
  }

  // Cases by type.
  const { data: casesByType } = await supabase
    .from("cases")
    .select("case_type")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null);

  const typeCount: Record<string, number> = {};
  for (const cs of casesByType ?? []) {
    typeCount[cs.case_type] = (typeCount[cs.case_type] ?? 0) + 1;
  }

  // Top clients by case count.
  const { data: topClients } = await supabase
    .from("clients")
    .select("id, name")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("name")
    .limit(10);

  const clientRows: (string | number)[][] = [];
  for (const cl of topClients ?? []) {
    const { count } = await supabase
      .from("cases")
      .select("id", { count: "exact", head: true })
      .eq("client_id", cl.id)
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null);
    clientRows.push([cl.name, count ?? 0]);
  }
  clientRows.sort((a, b) => Number(b[1]) - Number(a[1]));

  return renderPage(
    c,
    { title: "Relatorios", active: "reports" },
    <>
      <PageHeader title="Relatorios" />
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Processos por status">
          <Table
            columns={[{ label: "Status" }, { label: "Quantidade" }]}
            rows={Object.entries(statusCount).map(([s, n]) => [
              s === "active" ? "Ativo" : s === "suspended" ? "Suspenso" : "Arquivado",
              n,
            ])}
            emptyMsg="Sem dados."
          />
        </Panel>
        <Panel title="Processos por tipo">
          <Table
            columns={[{ label: "Tipo" }, { label: "Quantidade" }]}
            rows={Object.entries(typeCount).map(([t, n]) => [t, n])}
            emptyMsg="Sem dados."
          />
        </Panel>
      </div>
      <div class="mt-6">
        <Panel title="Top clientes por numero de processos">
          <Table
            columns={[{ label: "Cliente" }, { label: "Processos", align: "center" }]}
            rows={clientRows}
            emptyMsg="Sem dados."
          />
        </Panel>
      </div>
    </>,
  );
});
