import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, TextField, Select, Panel, Badge, Modal } from "../components/ui";
import { queryQueridoDiario, queryDigesto, type DiarioResult } from "../lib/integrations";

export const diarioRoutes = new Hono<AppEnv>();

diarioRoutes.use("*", requireAuth);

// GET / -- main page with search form + saved searches.
diarioRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";
  const territoryId = c.req.query("territory_id")?.trim() ?? "";
  const dateFrom = c.req.query("date_from")?.trim() ?? "";
  const dateTo = c.req.query("date_to")?.trim() ?? "";
  const provider = c.req.query("provider")?.trim() ?? "querido_diario";
  const executed = c.req.query("executed") === "true";

  // Fetch saved searches (monitoring).
  const { data: savedSearches } = await supabase
    .from("diario_searches")
    .select("id, query_term, territory_name, provider, is_monitoring, last_checked_at, created_at")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(10);

  let results: DiarioResult[] = [];
  let searchError = "";
  let totalFound = 0;

  if (executed && search) {
    if (provider === "digesto") {
      // Check if tenant has Digesto integration configured.
      const { data: digestoInt } = await supabase
        .from("integrations")
        .select("config")
        .eq("tenant_id", user.tenantId)
        .eq("type", "digesto")
        .eq("active", true)
        .limit(1)
        .maybeSingle();

      if (!digestoInt) {
        searchError = "Digesto nao configurado. Use Querido Diario (gratuito) ou configure o Digesto.";
      } else {
        const token = (digestoInt.config as { api_token?: string }).api_token ?? "";
        const res = await queryDigesto(token, search, dateFrom, dateTo);
        if (res.success) {
          results = res.data as DiarioResult[];
          totalFound = results.length;
        } else {
          searchError = res.message;
        }
      }
    } else {
      // Querido Diario (free).
      const res = await queryQueridoDiario(search, territoryId || undefined, dateFrom || undefined, dateTo || undefined);
      if (res.success) {
        results = res.data as DiarioResult[];
        totalFound = results.length;
      } else {
        searchError = res.message;
      }
    }

    // Save results to database.
    if (results.length > 0) {
      // First, create a search record.
      const { data: searchRecord } = await supabase
        .from("diario_searches")
        .insert({
          tenant_id: user.tenantId,
          query_term: search,
          territory_id: territoryId || null,
          provider,
          date_from: dateFrom || null,
          date_to: dateTo || null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (searchRecord) {
        // Save results.
        await supabase.from("diario_results").insert(
          results.map((r) => ({
            tenant_id: user.tenantId,
            search_id: searchRecord.id,
            external_id: r.external_id,
            title: r.title,
            subtitle: r.subtitle ?? null,
            section: r.section ?? null,
            edition: r.edition ?? null,
            publishing_date: r.publishing_date || null,
            url: r.url ?? null,
            txt_url: r.txt_url ?? null,
            excerpt: r.excerpt ?? null,
          })),
        );
      }
    }
  }

  // Build results table rows.
  const resultRows = results.map((r) => [
    r.title,
    r.publishing_date ? new Date(r.publishing_date).toLocaleDateString("pt-BR") : "-",
    r.section ?? "-",
    r.excerpt ? `${r.excerpt.slice(0, 100)}...` : "-",
    r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" class="text-[#0568ff] hover:underline">Ver</a> as unknown as string : "-",
  ]);

  // Saved searches rows.
  const savedRows = (savedSearches ?? []).map((s) => [
    s.query_term,
    s.territory_name ?? "Todos",
    s.provider === "digesto" ? "Digesto" : "Querido Diario",
    s.is_monitoring ? <Badge color="green" icon="ph-bell">Monitorando</Badge> as unknown as string : <Badge color="gray">Unica</Badge> as unknown as string,
    s.last_checked_at ? new Date(s.last_checked_at).toLocaleDateString("pt-BR") : "-",
    <a href={`/diario-oficial/${s.id}`} class="text-[#0568ff] hover:underline">Ver resultados</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Diario Oficial", active: "diario-oficial" },
    <>
      <PageHeader
        title="Diario Oficial"
        icon="ph-newspaper"
        actions={() => (
          <Modal
            id="saveSearch"
            title="Salvar Busca / Monitoramento"
            icon="ph-bell"
            triggerText="Salvar Busca"
            triggerIcon="ph-bell"
            triggerVariant="secondary"
            action="/diario-oficial/save"
            submitLabel="Salvar"
            large
          >
            <TextField label="Termo de busca" id="save_query_term" name="query_term" required placeholder="Ex: nome do cliente, numero do processo" icon="ph-magnifying-glass" />
            <TextField label="Municipio (codigo IBGE, opcional)" id="save_territory_id" name="territory_id" placeholder="Ex: 3550308 para Sao Paulo" />
            <Select label="Provider" id="save_provider" name="provider"
              options={[
                { value: "querido_diario", label: "Querido Diario (gratuito)" },
                { value: "digesto", label: "Digesto (pago)" },
              ]}
            />
            <div class="flex items-center gap-2">
              <input type="checkbox" id="is_monitoring" name="is_monitoring" value="true" />
              <label for="is_monitoring" class="text-body-sm font-semibold text-gray-700">Monitorar continuamente (verifica diariamente)</label>
            </div>
          </Modal>
        )}
      />

      {/* Search form */}
      <Panel title="Buscar em Diarios Oficiais" icon="ph-magnifying-glass">
        <form method="get" action="/diario-oficial" class="flex flex-col gap-4">
          <input type="hidden" name="executed" value="true" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Termo de busca" id="search" name="search" value={search} required placeholder="Ex: nome do cliente, numero do processo, OAB..." icon="ph-magnifying-glass" />
            <Select label="Provider" id="provider" name="provider"
              options={[
                { value: "querido_diario", label: "Querido Diario (gratuito)" },
                { value: "digesto", label: "Digesto (pago)" },
              ]}
              selected={provider}
            />
          </div>
          <div class="grid grid-cols-3 gap-4">
            <TextField label="Codigo IBGE do municipio (opcional)" id="territory_id" name="territory_id" value={territoryId} placeholder="Ex: 3550308" />
            <TextField label="Data inicial" id="date_from" name="date_from" type="date" value={dateFrom} />
            <TextField label="Data final" id="date_to" name="date_to" type="date" value={dateTo} />
          </div>
          <button type="submit" class="btn btn-primary inline-flex items-center gap-1 w-fit">
            <i class="ph ph-magnifying-glass" aria-hidden="true"></i> Buscar
          </button>
        </form>
      </Panel>

      {/* Error message */}
      {searchError ? (
        <div class="mb-4 p-3 border border-red-200 bg-red-50 text-red-800 rounded flex items-start gap-2">
          <i class="ph ph-warning-circle text-h4" aria-hidden="true"></i>
          <span class="text-body-sm">{searchError}</span>
        </div>
      ) : null}

      {/* Results */}
      {executed && !searchError ? (
        <div class="mb-6">
          <h3 class="text-body-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
            Resultados {totalFound > 0 ? `(${totalFound})` : ""}
          </h3>
          {results.length > 0 ? (
            <Table
              columns={[{ label: "Titulo" }, { label: "Data" }, { label: "Secao" }, { label: "Trecho" }, { label: "Link" }]}
              rows={resultRows}
              emptyMsg="Nenhuma publicacao encontrada."
              emptyIcon="ph-newspaper"
              ariaLabel="Resultados da busca"
            />
          ) : (
            <Panel>
              <p class="text-body-sm text-gray-500">Nenhuma publicacao encontrada para os criterios informados. Tente ampliar a busca (remover filtro de municipio ou ampliar o periodo).</p>
            </Panel>
          )}
        </div>
      ) : null}

      {/* Saved searches / monitoring */}
      <div class="mb-6">
        <h3 class="text-body-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Buscas Salvas e Monitoramento</h3>
        <Table
          columns={[{ label: "Termo" }, { label: "Municipio" }, { label: "Provider" }, { label: "Status" }, { label: "Ultima verificacao" }, { label: "" }]}
          rows={savedRows}
          emptyMsg="Nenhuma busca salva. Use 'Salvar Busca' para monitorar publicacoes automaticamente."
          emptyIcon="ph-bell-slash"
          ariaLabel="Buscas salvas"
        />
      </div>
    </>,
  );
});

// GET /:id -- view saved search results.
diarioRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: search } = await supabase
    .from("diario_searches")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!search) return c.html("Busca nao encontrada.", 404);

  const { data: results } = await supabase
    .from("diario_results")
    .select("*")
    .eq("search_id", id)
    .eq("tenant_id", user.tenantId)
    .order("publishing_date", { ascending: false })
    .limit(50);

  const rows = (results ?? []).map((r) => [
    r.title,
    r.publishing_date ? new Date(r.publishing_date).toLocaleDateString("pt-BR") : "-",
    r.section ?? "-",
    r.excerpt ? `${r.excerpt.slice(0, 100)}...` : "-",
    r.is_read ? <Badge color="gray">Lido</Badge> as unknown as string : <Badge color="blue">Novo</Badge> as unknown as string,
    r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" class="text-[#0568ff] hover:underline">Ver</a> as unknown as string : "-",
  ]);

  return renderPage(
    c,
    { title: `Busca: ${search.query_term}`, active: "diario-oficial" },
    <>
      <PageHeader
        title={`Resultados: ${search.query_term}`}
        icon="ph-newspaper"
        actions={() => (
          <div class="flex gap-2">
            <a href="/diario-oficial" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-arrow-left" aria-hidden="true"></i> Voltar
            </a>
            <form method="post" action={`/diario-oficial/${id}/refresh`} class="inline">
              <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
                <i class="ph ph-arrows-clockwise" aria-hidden="true"></i> Atualizar
              </button>
            </form>
            <form method="post" action={`/diario-oficial/${id}/delete`} class="inline">
              <button type="submit" class="btn btn-danger inline-flex items-center gap-1" onclick="return confirm('Excluir esta busca e todos os resultados?')" aria-label="Excluir">
                <i class="ph ph-trash" aria-hidden="true"></i> Excluir
              </button>
            </form>
          </div>
        )}
      />
      <Panel title="Detalhes da Busca" icon="ph-info">
        <dl class="grid grid-cols-2 gap-2 text-body-sm">
          <div><dt class="font-semibold text-gray-700 inline">Termo: </dt><dd class="inline">{search.query_term}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Provider: </dt><dd class="inline">{search.provider === "digesto" ? "Digesto" : "Querido Diario"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Municipio: </dt><dd class="inline">{search.territory_name ?? search.territory_id ?? "Todos"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Monitorando: </dt><dd class="inline">{search.is_monitoring ? "Sim" : "Nao"}</dd></div>
        </dl>
      </Panel>
      <Table
        columns={[{ label: "Titulo" }, { label: "Data" }, { label: "Secao" }, { label: "Trecho" }, { label: "Status" }, { label: "Link" }]}
        rows={rows}
        emptyMsg="Nenhum resultado armazenado. Clique em 'Atualizar' para buscar novamente."
        emptyIcon="ph-newspaper"
        ariaLabel="Resultados salvos"
      />
    </>,
  );
});

// POST /save -- save a search for monitoring.
diarioRoutes.post("/save", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const queryTerm = String(body.query_term ?? "");
  const territoryId = String(body.territory_id ?? "") || null;
  const provider = String(body.provider ?? "querido_diario");
  const isMonitoring = body.is_monitoring === "true";

  if (!queryTerm) return c.redirect("/diario-oficial");

  await supabase.from("diario_searches").insert({
    tenant_id: user.tenantId,
    query_term: queryTerm,
    territory_id: territoryId,
    provider,
    is_monitoring: isMonitoring,
    created_by: user.id,
  });

  return c.redirect("/diario-oficial");
});

// POST /:id/refresh -- re-run a saved search.
diarioRoutes.post("/:id/refresh", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: search } = await supabase
    .from("diario_searches")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!search) return c.redirect("/diario-oficial");

  let results: DiarioResult[] = [];
  if (search.provider === "digesto") {
    const { data: digestoInt } = await supabase
      .from("integrations")
      .select("config")
      .eq("tenant_id", user.tenantId)
      .eq("type", "digesto")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (digestoInt) {
      const token = (digestoInt.config as { api_token?: string }).api_token ?? "";
      const res = await queryDigesto(token, search.query_term, search.date_from ?? undefined, search.date_to ?? undefined);
      if (res.success) results = res.data as DiarioResult[];
    }
  } else {
    const res = await queryQueridoDiario(search.query_term, search.territory_id ?? undefined, search.date_from ?? undefined, search.date_to ?? undefined);
    if (res.success) results = res.data as DiarioResult[];
  }

  // Save new results (upsert by external_id).
  if (results.length > 0) {
    for (const r of results) {
      await supabase.from("diario_results").upsert({
        tenant_id: user.tenantId,
        search_id: id,
        external_id: r.external_id,
        title: r.title,
        subtitle: r.subtitle ?? null,
        section: r.section ?? null,
        edition: r.edition ?? null,
        publishing_date: r.publishing_date || null,
        url: r.url ?? null,
        txt_url: r.txt_url ?? null,
        excerpt: r.excerpt ?? null,
      }, { onConflict: "search_id,external_id" });
    }
  }

  // Update last_checked_at.
  await supabase
    .from("diario_searches")
    .update({ last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);

  return c.redirect(`/diario-oficial/${id}`);
});

// POST /:id/delete -- delete a saved search.
diarioRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("diario_searches")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/diario-oficial");
});
