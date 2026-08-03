import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { translateMovement } from "../lib/ai";
import { queryCNJProcess } from "../lib/integrations";
import { sanitizeILike } from "../lib/search-sanitize";
import type { IntegrationConfig } from "../lib/integrations";
import { CNJ_API_KEY, CNJ_BASE_URL } from "../lib/env";
import { caseBelongsToTenant } from "../lib/tenant-ownership";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const proceedingsRoutes = new Hono<AppEnv>();

proceedingsRoutes.use("*", requireAuth);

// Common tribunals for DataJud search.
const TRIBUNAL_OPTIONS = [
  { value: "TJSP", label: "TJSP - Tribunal de Justica de Sao Paulo" },
  { value: "TJRJ", label: "TJRJ - Tribunal de Justica do Rio de Janeiro" },
  { value: "TJMG", label: "TJMG - Tribunal de Justica de Minas Gerais" },
  { value: "TJRS", label: "TJRS - Tribunal de Justica do Rio Grande do Sul" },
  { value: "TJPR", label: "TJPR - Tribunal de Justica do Parana" },
  { value: "TJSC", label: "TJSC - Tribunal de Justica de Santa Catarina" },
  { value: "TJBA", label: "TJBA - Tribunal de Justica da Bahia" },
  { value: "TJPE", label: "TJPE - Tribunal de Justica de Pernambuco" },
  { value: "TJCE", label: "TJCE - Tribunal de Justica do Ceara" },
  { value: "TJDFT", label: "TJDFT - Tribunal de Justica do Distrito Federal e Territorios" },
  { value: "STJ", label: "STJ - Superior Tribunal de Justica" },
  { value: "STF", label: "STF - Supremo Tribunal Federal" },
  { value: "TRF1", label: "TRF1 - Tribunal Regional Federal da 1a Regiao" },
  { value: "TRF2", label: "TRF2 - Tribunal Regional Federal da 2a Regiao" },
  { value: "TRF3", label: "TRF3 - Tribunal Regional Federal da 3a Regiao" },
  { value: "TRF4", label: "TRF4 - Tribunal Regional Federal da 4a Regiao" },
  { value: "TRF5", label: "TRF5 - Tribunal Regional Federal da 5a Regiao" },
  { value: "TRF6", label: "TRF6 - Tribunal Regional Federal da 6a Regiao" },
];

// DataJud process source shape (subset of fields we use).
interface DataJudProcess {
  numeroProcesso?: string;
  tribunal?: string;
  orgao?: string;
  classe?: { nome?: string } | string;
  dataAjuizamento?: string;
  partes?: { nome?: string; tipoParte?: string }[];
  movimentos?: { nome?: string; dataHora?: string; codigo?: number }[];
}

const proceedingSchema = z.object({
  case_id: z.string().max(36).uuid("Processo invalido"),
  cnj_number: z.string().min(1, "Numero CNJ e obrigatorio").max(50),
  tribunal: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
});

const movementSchema = z.object({
  movement_text: z.string().min(1, "Texto do movimento e obrigatorio"),
  movement_date: z.string().min(1, "Data do movimento e obrigatoria"),
});

// GET /proceedings -- list all proceedings for the tenant (with case title).
proceedingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;
  const search = c.req.query("search")?.trim() ?? "";

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let proceedingsQuery = supabase
    .from("proceedings")
    .select("id, cnj_number, tribunal, cases(title)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (search) proceedingsQuery = proceedingsQuery.ilike("cnj_number", `%${sanitizeILike(search)}%`);

  proceedingsQuery = proceedingsQuery.range(offset, offset + limit - 1);

  const [proceedingsRes, casesRes] = await Promise.all([
    proceedingsQuery,
    supabase.from("cases").select("id, title").eq("tenant_id", user.tenantId).is("deleted_at", null).order("title"),
  ]);

  const proceedings = proceedingsRes.data;
  const count = proceedingsRes.count;
  const totalPages = count ? Math.ceil(count / limit) : 1;
  const caseOptions = (casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }));

  const rows = (proceedings ?? []).map((p) => [
    <a href={`/proceedings/${p.id}`} class="text-[#0568ff] hover:underline">{p.cnj_number}</a> as unknown as string,
    (p.cases as unknown as { title: string } | null)?.title ?? "-",
    p.tribunal ?? "-",
    <div class="flex items-center gap-2">
      <a href={`/proceedings/${p.id}`} class="text-[#0568ff] hover:underline text-body-sm">Ver</a>
      <a href={`/proceedings/${p.id}`} class="text-[#0568ff] hover:underline text-body-sm">Editar</a>
      <form method="post" action={`/proceedings/${p.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
    </div> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Andamentos", active: "proceedings" },
    <>
      <PageHeader title="Andamentos" icon="ph-list-dashes" actions={() => (
        <div class="flex gap-2">
          <a href="/proceedings/search-cnj" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-magnifying-glass" aria-hidden="true"></i>Buscar no DataJud
          </a>
          <Modal
            id="new-proceeding"
            title="Novo Processo CNJ"
            icon="ph-scales"
            triggerText="Novo Processo CNJ"
            triggerIcon="ph-plus"
            action="/proceedings"
            large
          >
            <ComboBox label="Processo" id="case_id" name="case_id" required
              options={caseOptions}
            />
            <TextField label="Numero CNJ" id="cnj_number" name="cnj_number" required placeholder="0000000-00.0000.0.00.0000" />
          <div class="grid grid-cols-2 gap-4">
            <TextField label="Tribunal" id="tribunal" name="tribunal" />
            <TextField label="Comarca" id="district" name="district" />
          </div>
        </Modal>
        </div>
      )} />
      <form method="get" action="/proceedings" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Numero CNJ..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[{ label: "CNJ" }, { label: "Processo" }, { label: "Tribunal" }, { label: "Acoes" }]}
        rows={rows}
        emptyMsg="Nenhum processo CNJ cadastrado."
        emptyIcon="ph-scales"
        ariaLabel="Lista de processos CNJ"
        count={count ?? 0}
        countLabel="processo(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/proceedings",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// POST /proceedings -- create.
proceedingsRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = proceedingSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/proceedings");

  if (parsed.data.case_id) {
    const owns = await caseBelongsToTenant(parsed.data.case_id, user.tenantId);
    if (!owns) return c.html("Não encontrado.", 404);
  }

  await supabase.from("proceedings").insert({
    tenant_id: user.tenantId,
    case_id: parsed.data.case_id,
    cnj_number: parsed.data.cnj_number,
    tribunal: parsed.data.tribunal || null,
    district: parsed.data.district || null,
  });

  return c.redirect("/proceedings");
});

// GET /proceedings/search-cnj -- DataJud search form + results.
proceedingsRoutes.get("/search-cnj", async (c) => {
  const user = c.get("user");
  const cnjNumber = c.req.query("cnj_number")?.trim() ?? "";
  const tribunal = c.req.query("tribunal")?.trim() ?? "";

  // Fetch case options for the import form.
  const { data: casesData } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");
  const caseOptions = (casesData ?? []).map((cs) => ({ value: cs.id, label: cs.title }));

  let results: DataJudProcess[] = [];
  let searchError = "";
  let searched = false;

  if (cnjNumber && tribunal) {
    searched = true;
    // CNJ DataJud is SaaS-managed (env var, not per-tenant integration).
    if (!CNJ_API_KEY) {
      searchError = "CNJ DataJud nao configurado no servidor. Contate o administrador.";
    } else {
      try {
        const cnjConfig = { api_key: CNJ_API_KEY, base_url: CNJ_BASE_URL } as unknown as IntegrationConfig;
        const res = await queryCNJProcess(cnjConfig, cnjNumber, tribunal);
        if (res.success) {
          results = (res.data as DataJudProcess[]) ?? [];
        } else {
          console.error("[proceedings] DataJud query failed", { error: res.message });
          searchError = "Ocorreu um erro ao consultar o DataJud. Tente novamente.";
        }
      } catch (err) {
        console.error("[proceedings] DataJud query exception", { error: (err as Error).message });
        searchError = "Ocorreu um erro ao consultar o DataJud. Tente novamente.";
      }
    }
  }

  // Helper to format a date string (DataJud uses ISO format).
  const formatDate = (d?: string) => {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("pt-BR");
    } catch {
      return d;
    }
  };

  // Helper to extract class name.
  const getClassName = (cls: DataJudProcess["classe"]) => {
    if (!cls) return "-";
    if (typeof cls === "string") return cls;
    return cls.nome ?? "-";
  };

  // Helper to format parties list.
  const getParties = (parties: DataJudProcess["partes"]) => {
    if (!parties || parties.length === 0) return "-";
    return parties.map((p) => `${p.tipoParte ?? ""}: ${p.nome ?? ""}`.trim()).join("; ");
  };

  return renderPage(
    c,
    { title: "Buscar no DataJud", active: "proceedings" },
    <>
      <PageHeader title="Buscar no DataJud" icon="ph-magnifying-glass" actions={() => (
        <a href="/proceedings" class="btn btn-secondary inline-flex items-center gap-1">
          <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
        </a>
      )} />
      <form method="get" action="/proceedings/search-cnj" class="mb-4 flex gap-4 items-end flex-wrap">
        <TextField label="Numero CNJ" id="cnj_number" name="cnj_number" type="text" value={cnjNumber} required placeholder="0000000-00.0000.0.00.0000" icon="ph-scales" />
        <Select label="Tribunal" id="tribunal" name="tribunal" options={TRIBUNAL_OPTIONS} selected={tribunal} required icon="ph-building" />
        <button type="submit" class="btn btn-primary inline-flex items-center gap-1"><i class="ph ph-magnifying-glass" aria-hidden="true"></i>Buscar</button>
      </form>

      {searchError ? (
        <Panel title="Erro" icon="ph-warning">
          <p class="text-status-red text-body-sm">{searchError}</p>
        </Panel>
      ) : null}

      {searched && !searchError ? (
        <Panel title={`Resultados (${results.length})`} icon="ph-list">
          {results.length === 0 ? (
            <p class="text-gray-500 text-body-sm py-4 text-center">Nenhum processo encontrado para o numero informado.</p>
          ) : (
            <Table
              columns={[
                { label: "Numero" },
                { label: "Tribunal" },
                { label: "Orgao" },
                { label: "Classe" },
                { label: "Ajuizamento" },
                { label: "Partes" },
                { label: "" },
              ]}
              rows={results.map((p) => [
                p.numeroProcesso ?? "-",
                p.tribunal ?? tribunal,
                p.orgao ?? "-",
                getClassName(p.classe),
                formatDate(p.dataAjuizamento),
                <span class="text-body-sm text-gray-600">{getParties(p.partes)}</span> as unknown as string,
                (
                  <Modal
                    id={`import-${(p.numeroProcesso ?? "x").replace(/[^a-zA-Z0-9]/g, "")}`}
                    title="Importar Processo"
                    icon="ph-download-simple"
                    triggerText="Importar"
                    triggerIcon="ph-download-simple"
                    triggerVariant="secondary"
                    action="/proceedings/import-cnj"
                    large
                    submitLabel="Importar"
                    submitIcon="ph-download-simple"
                  >
                    <ComboBox label="Vincular ao Processo" id="case_id" name="case_id" required options={caseOptions} />
                    <TextField label="Numero CNJ" id="cnj_number_display" name="cnj_number" value={p.numeroProcesso ?? ""} required />
                    <input type="hidden" name="tribunal" value={p.tribunal ?? tribunal} />
                    <input type="hidden" name="court_branch" value={p.orgao ?? ""} />
                    <input type="hidden" name="case_class" value={getClassName(p.classe)} />
                    <div class="grid grid-cols-2 gap-4">
                      <TextField label="Tribunal" id="tribunal_display" name="tribunal_display" value={p.tribunal ?? tribunal} />
                      <TextField label="Orgao" id="court_branch_display" name="court_branch_display" value={p.orgao ?? "-"} />
                    </div>
                  </Modal>
                ) as unknown as string,
              ])}
              emptyMsg="Nenhum processo encontrado."
            />
          )}
        </Panel>
      ) : null}
    </>,
  );
});

// POST /proceedings/import-cnj -- import a process from DataJud.
proceedingsRoutes.post("/import-cnj", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const case_id = body["case_id"] as string;
  const cnj_number = body["cnj_number"] as string;
  const tribunal = body["tribunal"] as string;
  const court_branch = body["court_branch"] as string;
  const case_class = body["case_class"] as string;

  if (!case_id || !cnj_number) {
    return c.redirect("/proceedings/search-cnj");
  }

  const ownsCase = await caseBelongsToTenant(case_id, user.tenantId);
  if (!ownsCase) return c.html("Não encontrado.", 404);

  const { data, error } = await supabase.from("proceedings").insert({
    tenant_id: user.tenantId,
    case_id: case_id,
    cnj_number: cnj_number,
    tribunal: tribunal || null,
    district: court_branch || null,
    data_source: "cnj",
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
  }).select("id").single();

  if (error || !data) {
    return c.redirect("/proceedings/search-cnj");
  }

  return c.redirect(`/proceedings/${data.id}`);
});

// GET /proceedings/:id -- detail with movements.
proceedingsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: proceeding } = await supabase
    .from("proceedings")
    .select("*, cases(title, description)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!proceeding) return c.html("Processo CNJ nao encontrado.", 404);

  const { data: movements } = await supabase
    .from("proceeding_movements")
    .select("id, movement_text, ai_translation, movement_date, captured_at")
    .eq("proceeding_id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("movement_date", { ascending: false });

  const caseData = proceeding.cases as { title: string; description?: string } | null;

  return renderPage(
    c,
    { title: proceeding.cnj_number, active: "proceedings" },
    <>
      <PageHeader
        title={proceeding.cnj_number}
        icon="ph-scales"
        actions={() => (
          <div class="flex gap-2">
            <form method="post" action={`/proceedings/${id}/sync-cnj`}>
              <button type="submit" class="btn btn-secondary" onclick="return confirm('Sincronizar andamentos com DataJud?')"><i class="ph ph-arrows-clockwise" aria-hidden="true"></i>Sincronizar com DataJud</button>
            </form>
            {proceeding.tribunal && (proceeding.tribunal === "TJSP" || proceeding.tribunal.startsWith("TJ")) ? (
              <a href={`https://esaj.tjsp.jus.br/cpopg/open.do?processo.numero=${proceeding.cnj_number}`} target="_blank" rel="noopener noreferrer" class="btn btn-secondary inline-flex items-center gap-1">
                <i class="ph ph-arrow-square-out" aria-hidden="true"></i>Abrir no e-SAJ
              </a>
            ) : null}
            <Modal
              id="new-movement"
              title={`Novo Andamento - ${proceeding.cnj_number}`}
              icon="ph-list-dashes"
              triggerText="Novo Andamento"
              triggerIcon="ph-plus"
              action={`/proceedings/${id}/movements`}
            >
              <TextField label="Data do movimento" id="movement_date" name="movement_date" type="date" required />
              <Textarea label="Texto do movimento" id="movement_text" name="movement_text" rows={6} required />
            </Modal>
            <form method="post" action={`/proceedings/${id}/delete`}>
              <button type="submit" class="btn btn-danger" onclick="return confirm('Excluir este processo CNJ?')" aria-label="Excluir"><i class="ph ph-trash" aria-hidden="true"></i>Excluir</button>
            </form>
          </div>
        )}
      />
      <Panel title="Dados do processo CNJ" icon="ph-scales">
        <dl class="flex flex-col gap-1 text-body-sm">
          <div><dt class="font-semibold text-gray-700 inline">Processo: </dt><dd class="inline"><a href={`/cases/${proceeding.case_id}`} class="text-[#0568ff] hover:underline">{caseData?.title ?? "-"}</a></dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Tribunal: </dt><dd class="inline">{proceeding.tribunal ?? "-"}</dd></div>
          <div><dt class="font-semibold text-gray-700 inline">Comarca: </dt><dd class="inline">{proceeding.district ?? "-"}</dd></div>
          <div class="flex items-center gap-2">
            <dt class="font-semibold text-gray-700 inline">Sincronizacao: </dt>
            <dd class="inline">
              {proceeding.sync_status ? (
                <Badge color={proceeding.sync_status === "synced" ? "green" : proceeding.sync_status === "error" ? "red" : "gray"} icon={proceeding.sync_status === "synced" ? "ph-check-circle" : "ph-clock"}>
                  {proceeding.sync_status}
                </Badge>
              ) : (
                <Badge color="gray" icon="ph-clock">nao sincronizado</Badge>
              )}
              {proceeding.last_synced_at ? (
                <span class="text-gray-500 ml-2">ultima: {new Date(proceeding.last_synced_at).toLocaleString("pt-BR")}</span>
              ) : null}
            </dd>
          </div>
        </dl>
      </Panel>

      <div class="mt-6">
        <Panel title="Andamentos" icon="ph-list-dashes">
          <Table
            columns={[{ label: "Data" }, { label: "Movimento" }, { label: "Traducao IA" }, { label: "" }]}
            rows={(movements ?? []).map((m) => [
              new Date(m.movement_date).toLocaleDateString("pt-BR"),
              m.movement_text,
              m.ai_translation ? <span class="text-body-sm text-gray-600">{m.ai_translation}</span> : <span class="text-gray-400">-</span> as unknown as string,
              m.ai_translation ? null : (
                <form method="post" action={`/proceedings/${id}/movements/${m.id}/translate`}>
                  <button type="submit" class="btn btn-secondary"><i class="ph ph-translate" aria-hidden="true"></i>Traduzir IA</button>
                </form>
              ) as unknown as string,
            ])}
            emptyMsg="Nenhum andamento registrado."
          />
        </Panel>
      </div>
    </>,
  );
});

// POST /proceedings/:id/movements -- create movement.
proceedingsRoutes.post("/:id/movements", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const parsed = movementSchema.safeParse(body);
  if (!parsed.success) return c.redirect(`/proceedings/${id}`);

  await supabase.from("proceeding_movements").insert({
    tenant_id: user.tenantId,
    proceeding_id: id,
    movement_text: parsed.data.movement_text,
    movement_date: new Date(parsed.data.movement_date).toISOString(),
  });

  return c.redirect(`/proceedings/${id}`);
});

// POST /proceedings/:id/movements/:mid/translate -- AI translate movement.
proceedingsRoutes.post("/:id/movements/:mid/translate", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const mid = c.req.param("mid");

  const { data: movement } = await supabase
    .from("proceeding_movements")
    .select("movement_text")
    .eq("id", mid)
    .eq("tenant_id", user.tenantId)
    .single();
  if (!movement) return c.html("Andamento nao encontrado.", 404);

  const { data: proceeding } = await supabase
    .from("proceedings")
    .select("cases(title, description)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  const caseData = proceeding?.cases as unknown as { title: string; description?: string } | null;
  const context = caseData ? `${caseData.title}${caseData.description ? ` - ${caseData.description}` : ""}` : undefined;

  try {
    const translation = await translateMovement(user.tenantId, movement.movement_text, context);
    await supabase.from("proceeding_movements").update({ ai_translation: translation }).eq("id", mid).eq("tenant_id", user.tenantId);
  } catch (err) {
    console.error("translate error:", err);
  }

  return c.redirect(`/proceedings/${id}`);
});

// POST /proceedings/:id/delete -- soft delete.
proceedingsRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await supabase.from("proceedings").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", user.tenantId);
  return c.redirect("/proceedings");
});

// POST /proceedings/:id/sync-cnj -- sync movements from DataJud.
proceedingsRoutes.post("/:id/sync-cnj", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Get the proceeding.
  const { data: proceeding } = await supabase
    .from("proceedings")
    .select("id, cnj_number, tribunal")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .single();

  if (!proceeding) return c.html("Processo CNJ nao encontrado.", 404);

  // CNJ DataJud is SaaS-managed (env var, not per-tenant integration).
  if (!CNJ_API_KEY) {
    return c.redirect(`/proceedings/${id}`);
  }

  const tribunal = proceeding.tribunal ?? "TJSP";
  try {
    const cnjConfig = { api_key: CNJ_API_KEY, base_url: CNJ_BASE_URL } as unknown as IntegrationConfig;
    const res = await queryCNJProcess(cnjConfig, proceeding.cnj_number, tribunal);
    if (!res.success) {
      console.error("sync-cnj error:", res.message);
      return c.redirect(`/proceedings/${id}`);
    }

    const processes = (res.data as DataJudProcess[]) ?? [];
    if (processes.length === 0) {
      // No data but still update sync timestamp.
      await supabase.from("proceedings").update({
        last_synced_at: new Date().toISOString(),
        sync_status: "synced",
      }).eq("id", id).eq("tenant_id", user.tenantId);
      return c.redirect(`/proceedings/${id}`);
    }

    const processData = processes[0]!;
    const movimentos = processData.movimentos ?? [];

    // Fetch existing movements to avoid duplicates.
    const { data: existingMovements } = await supabase
      .from("proceeding_movements")
      .select("movement_date, movement_text")
      .eq("proceeding_id", id)
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null);

    const existingSet = new Set(
      (existingMovements ?? []).map((m) => `${new Date(m.movement_date).toISOString()}|${m.movement_text}`),
    );

    // Build new movements to insert.
    const newMovements = movimentos
      .filter((mv) => mv.nome && mv.dataHora)
      .map((mv) => {
        const dateIso = new Date(mv.dataHora!).toISOString();
        const text = mv.nome!;
        return {
          tenant_id: user.tenantId,
          proceeding_id: id,
          movement_text: text,
          movement_date: dateIso,
        };
      })
      .filter((mv) => !existingSet.has(`${mv.movement_date}|${mv.movement_text}`));

    if (newMovements.length > 0) {
      await supabase.from("proceeding_movements").insert(newMovements);
    }

    // Update sync status on the proceeding.
    await supabase.from("proceedings").update({
      last_synced_at: new Date().toISOString(),
      sync_status: "synced",
    }).eq("id", id).eq("tenant_id", user.tenantId);
  } catch (err) {
    console.error("sync-cnj error:", err);
  }

  return c.redirect(`/proceedings/${id}`);
});
