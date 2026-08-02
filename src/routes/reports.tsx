import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Panel, Table, Badge } from "../components/ui";
import { toCSV, csvResponse } from "../lib/export";

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
      <PageHeader title="Relatorios" icon="ph-chart-bar" actions={() => (
        <div class="flex gap-2">
          <a href="/reports/export?type=status" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-file-csv" aria-hidden="true"></i>Status CSV
          </a>
          <a href="/reports/export?type=type" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-file-csv" aria-hidden="true"></i>Tipos CSV
          </a>
          <a href="/reports/export?type=clients" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-file-csv" aria-hidden="true"></i>Clientes CSV
          </a>
        </div>
      )} />
      <div class="grid grid-cols-2 gap-4">
        <Panel title="Processos por status" icon="ph-folder-open">
          <Table
            columns={[{ label: "Status" }, { label: "Quantidade" }]}
            rows={Object.entries(statusCount).map(([s, n]) => [
              s === "active" ? "Ativo" : s === "suspended" ? "Suspenso" : "Arquivado",
              n,
            ])}
            emptyMsg="Sem dados."
            emptyIcon="ph-chart-bar"
          />
        </Panel>
        <Panel title="Processos por tipo" icon="ph-tag">
          <Table
            columns={[{ label: "Tipo" }, { label: "Quantidade" }]}
            rows={Object.entries(typeCount).map(([t, n]) => [t, n])}
            emptyMsg="Sem dados."
            emptyIcon="ph-chart-bar"
          />
        </Panel>
      </div>
      <div class="mt-6">
        <Panel title="Top clientes por numero de processos" icon="ph-users">
          <Table
            columns={[{ label: "Cliente" }, { label: "Processos", align: "center" }]}
            rows={clientRows}
            emptyMsg="Sem dados."
            emptyIcon="ph-chart-bar"
          />
        </Panel>
      </div>
    </>,
  );
});

// GET /reports/export — export report as CSV
reportsRoutes.get("/export", async (c) => {
  const user = c.get("user");
  const type = c.req.query("type") ?? "status";

  if (type === "status") {
    const { data } = await supabase
      .from("cases")
      .select("status")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
    const rows = Object.entries(counts).map(([s, n]) => [s, n]);
    return csvResponse("processos_por_status.csv", toCSV(rows, ["Status", "Quantidade"]));
  }

  if (type === "type") {
    const { data } = await supabase
      .from("cases")
      .select("case_type")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.case_type] = (counts[r.case_type] ?? 0) + 1;
    const rows = Object.entries(counts).map(([t, n]) => [t, n]);
    return csvResponse("processos_por_tipo.csv", toCSV(rows, ["Tipo", "Quantidade"]));
  }

  if (type === "clients") {
    // Single query with nested join to get case count per client (avoids N+1).
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, email, phone, cases(id)")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .order("name");
    const rows: (string | number)[][] = (clients ?? []).map((cl: { name: string; email?: string; phone?: string; cases: unknown[] }) => [
      cl.name,
      cl.email ?? "",
      cl.phone ?? "",
      Array.isArray(cl.cases) ? cl.cases.length : 0,
    ]);
    return csvResponse("clientes.csv", toCSV(rows, ["Nome", "Email", "Telefone", "Processos"]));
  }

  return c.text("Tipo de exportacao invalido", 400);
});
