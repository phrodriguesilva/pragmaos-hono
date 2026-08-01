import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table } from "../components/ui";

export const auditRoutes = new Hono<AppEnv>();

auditRoutes.use("*", requireAuth);

auditRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { data: logs } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, created_at, profiles(full_name)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (logs ?? []).map((l) => [
    new Date(l.created_at).toLocaleString("pt-BR"),
    (l.profiles as unknown as { full_name: string } | null)?.full_name ?? "-",
    l.action,
    l.entity_type,
    l.entity_id ? String(l.entity_id).slice(0, 8) : "-",
  ]);

  return renderPage(
    c,
    { title: "Auditoria", active: "audit" },
    <>
      <PageHeader title="Auditoria" />
      <Table
        columns={[{ label: "Data" }, { label: "Usuario" }, { label: "Acao" }, { label: "Entidade" }, { label: "ID" }]}
        rows={rows}
        emptyMsg="Nenhum registro de auditoria."
        ariaLabel="Log de auditoria"
      />
    </>,
  );
});
