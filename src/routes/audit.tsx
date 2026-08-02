import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table } from "../components/ui";

export const auditRoutes = new Hono<AppEnv>();

auditRoutes.use("*", requireAuth);
auditRoutes.use("*", requireRole("socio"));

auditRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const { data: logs, count } = await supabase
    .from("audit_log")
    .select("id, action, entity_type, entity_id, created_at, profiles(full_name)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalPages = count ? Math.ceil(count / limit) : 1;

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
      <PageHeader title="Auditoria" icon="ph-shield-check" />
      <Table
        columns={[{ label: "Data" }, { label: "Usuario" }, { label: "Acao" }, { label: "Entidade" }, { label: "ID" }]}
        rows={rows}
        emptyMsg="Nenhum registro de auditoria."
        emptyIcon="ph-shield-check"
        ariaLabel="Log de auditoria"
        count={count ?? 0}
        countLabel="registro(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/audit",
        }}
      />
    </>,
  );
});
