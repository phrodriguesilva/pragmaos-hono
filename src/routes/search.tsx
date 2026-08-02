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

  // Search documents (by title and extracted text content)
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title, doc_type, case_id, cases(title), clients(name)")
    .eq("tenant_id", user.tenantId)
    .or(`title.ilike.%${q}%,extracted_text.ilike.%${q}%`)
    .limit(10);
  for (const doc of documents ?? []) {
    const caseTitle = (doc.cases as unknown as { title: string } | null)?.title;
    const clientName = (doc.clients as unknown as { name: string } | null)?.name;
    results.push({
      type: "document",
      id: doc.id,
      title: doc.title,
      subtitle: [caseTitle, clientName].filter(Boolean).join(" — ") || doc.doc_type,
      link: `/documents/${doc.id}`,
      icon: "ph-file-text",
    });
  }

  return c.json({ results });
});

// GET /search/documents?q=query — full-text document search page
searchRoutes.get("/documents", async (c) => {
  const user = c.get("user");
  const q = c.req.query("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  let documents: Array<{
    id: string; title: string; doc_type: string; storage_path: string;
    created_at: string; extracted_text?: string;
    cases: { title: string }[] | null;
    clients: { name: string }[] | null;
  }> = [];
  let count = 0;

  if (q.length >= 2) {
    const { data, count: totalCount } = await supabase
      .from("documents")
      .select("id, title, doc_type, storage_path, created_at, extracted_text, cases(title), clients(name)", { count: "exact" })
      .eq("tenant_id", user.tenantId)
      .or(`title.ilike.%${q}%,extracted_text.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    documents = data ?? [];
    count = totalCount ?? 0;
  }

  // Generate snippets from extracted_text.
  function generateSnippet(text: string | undefined, query: string): string {
    if (!text) return "";
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);
    if (idx === -1) return text.slice(0, 200) + (text.length > 200 ? "..." : "");
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + query.length + 80);
    return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  }

  return c.html(
    <>
      <div class="max-w-4xl mx-auto px-4 py-8">
        <h1 class="text-h1 font-bold text-carvao-800 mb-6">Busca em Documentos</h1>

        <form method="get" action="/search/documents" class="mb-6">
          <div class="relative">
            <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true"></i>
            <input
              type="text"
              name="q"
              value={q}
              placeholder="Buscar no conteudo dos documentos..."
              class="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-terracota-500 focus:border-terracota-500"
              autofocus
            />
          </div>
        </form>

        {q.length >= 2 && (
          <div class="text-sm text-gray-500 mb-4">
            {count} resultado{count !== 1 ? "s" : ""} para "{q}"
          </div>
        )}

        <div class="space-y-3">
          {documents.map((doc) => {
            const caseTitle = doc.cases?.[0]?.title;
            const clientName = doc.clients?.[0]?.name;
            const snippet = generateSnippet(doc.extracted_text, q);
            return (
              <a href={`/documents/${doc.id}`} class="block p-4 bg-white rounded-lg border border-gray-100 hover:border-terracota-300 hover:shadow-sm transition">
                <div class="flex items-start gap-3">
                  <i class="ph ph-file-text text-h3 text-terracota-600 mt-1" aria-hidden="true"></i>
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-carvao-800">{doc.title}</div>
                    <div class="text-xs text-gray-400 mt-0.5">
                      {[caseTitle, clientName, doc.doc_type, new Date(doc.created_at).toLocaleDateString("pt-BR")].filter(Boolean).join(" — ")}
                    </div>
                    {snippet && (
                      <div class="text-sm text-gray-600 mt-2 line-clamp-2">{snippet}</div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}

          {q.length >= 2 && documents.length === 0 && (
            <div class="text-center py-12 text-gray-400">
              <i class="ph ph-file-search text-h1 block mb-2" aria-hidden="true"></i>
              Nenhum documento encontrado para "{q}"
            </div>
          )}

          {q.length < 2 && (
            <div class="text-center py-12 text-gray-400">
              <i class="ph ph-keyboard text-h1 block mb-2" aria-hidden="true"></i>
              Digite pelo menos 2 caracteres para buscar
            </div>
          )}
        </div>
      </div>
    </>,
  );
});
