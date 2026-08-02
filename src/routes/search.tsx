import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { supabase } from "../lib/supabase";

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.use("*", requireAuth);

// GET /search/api?q=query — global search API (JSON)
searchRoutes.get("/api", async (c) => {
  const user = c.get("user");
  const q = c.req.query("q")?.trim() ?? "";

  if (q.length < 2) {
    return c.json({ results: [] });
  }

  const results: { type: string; id: string; title: string; subtitle?: string; link: string; icon: string }[] = [];

  // Search cases
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number, status")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .or(`title.ilike.%${q}%,case_number.ilike.%${q}%`)
    .limit(5);
  for (const cs of cases ?? []) {
    results.push({
      type: "case",
      id: cs.id,
      title: cs.title,
      subtitle: cs.case_number ?? undefined,
      link: `/cases/${cs.id}`,
      icon: "ph-folder",
    });
  }

  // Search clients
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, cpf, cnpj")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .or(`name.ilike.%${q}%,email.ilike.%${q}%,cpf.ilike.%${q}%,cnpj.ilike.%${q}%`)
    .limit(5);
  for (const cl of clients ?? []) {
    results.push({
      type: "client",
      id: cl.id,
      title: cl.name,
      subtitle: cl.email ?? undefined,
      link: `/clients/${cl.id}`,
      icon: "ph-user",
    });
  }

  // Search deadlines
  const { data: deadlines } = await supabase
    .from("deadlines")
    .select("id, title, due_date")
    .eq("tenant_id", user.tenantId)
    .ilike("title", `%${q}%`)
    .limit(5);
  for (const d of deadlines ?? []) {
    results.push({
      type: "deadline",
      id: d.id,
      title: d.title,
      subtitle: new Date(d.due_date).toLocaleDateString("pt-BR"),
      link: `/deadlines/${d.id}`,
      icon: "ph-calendar-x",
    });
  }

  // Search invoices
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, number, amount_cents, status")
    .eq("tenant_id", user.tenantId)
    .ilike("number", `%${q}%`)
    .limit(5);
  for (const inv of invoices ?? []) {
    results.push({
      type: "invoice",
      id: inv.id,
      title: inv.number,
      subtitle: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(inv.amount_cents / 100),
      link: `/finance/${inv.id}`,
      icon: "ph-currency-dollar",
    });
  }

  // Search proceedings
  const { data: proceedings } = await supabase
    .from("proceedings")
    .select("id, cnj_number, cases(title)")
    .eq("tenant_id", user.tenantId)
    .ilike("cnj_number", `%${q}%`)
    .limit(5);
  for (const p of proceedings ?? []) {
    const caseTitle = (p.cases as unknown as { title: string } | null)?.title;
    results.push({
      type: "proceeding",
      id: p.id,
      title: p.cnj_number ?? "Processo",
      subtitle: caseTitle,
      link: `/cases/${p.id}`,
      icon: "ph-scales",
    });
  }

  return c.json({ results });
});
