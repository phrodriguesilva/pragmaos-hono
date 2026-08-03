import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth, requireRole } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { callLLM, getTenantLLMConfig, checkRateLimit } from "../lib/ai";
import { sanitizeILike } from "../lib/search-sanitize";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const aiSummariesRoutes = new Hono<AppEnv>();

aiSummariesRoutes.use("*", requireAuth);
aiSummariesRoutes.use("*", requireRole("socio", "admin", "advogado", "estagiario"));

// --- Helpers ---

const SUMMARY_TYPE_LABELS: Record<string, string> = {
  case: "Resumo de Processo",
  petition: "Resumo de Peticao",
  decision: "Explicacao de Decisao",
  hearing: "Resumo de Audiencia",
  proceeding: "Resumo de Andamento",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

// --- GET / -- list of generated summaries ---

aiSummariesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = c.req.query("search")?.trim() ?? "";

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const queryParams: Record<string, string> = {};
  if (search) queryParams.search = search;

  let summariesQuery = supabase
    .from("ai_summaries")
    .select("id, summary_type, summary_text, model, created_at, cases(title)", { count: "exact" })
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) summariesQuery = summariesQuery.ilike("summary_text", `%${sanitizeILike(search)}%`);

  const [summariesRes, casesRes] = await Promise.all([
    summariesQuery,
    supabase
      .from("cases")
      .select("id, title")
      .eq("tenant_id", user.tenantId)
      .is("deleted_at", null)
      .order("title"),
  ]);

  const { data: summaries, count } = summariesRes;
  const caseOptions = (casesRes.data ?? []).map((cs) => ({ value: cs.id, label: cs.title }));

  const totalPages = count ? Math.ceil(count / limit) : 1;

  const rows = (summaries ?? []).map((s) => {
    const caseTitle = (s.cases as unknown as { title: string } | null)?.title ?? "-";
    return [
      <Badge color="blue" icon="ph-sparkle">{SUMMARY_TYPE_LABELS[s.summary_type] ?? s.summary_type}</Badge> as unknown as string,
      caseTitle,
      (s.summary_text ?? "").slice(0, 100),
      formatDate(s.created_at),
      <div class="flex items-center gap-2">
        <a href={`/ai-summaries/${s.id}`} class="text-[#0568ff] hover:underline inline-flex items-center gap-1">
          <i class="ph ph-eye" aria-hidden="true"></i>Ver
        </a>
        <form method="post" action={`/ai-summaries/${s.id}/delete`} class="inline" onsubmit="return confirm('Excluir este registro?')"><button type="submit" class="text-status-red hover:underline text-body-sm" aria-label="Excluir">Excluir</button></form>
      </div> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Resumos com IA", active: "ai-summaries" },
    <>
      <PageHeader
        title="Resumos com IA"
        icon="ph-sparkle"
        actions={() => (
          <Modal
            id="new-summary"
            title="Gerar Resumo"
            icon="ph-sparkle"
            triggerText="Gerar Novo Resumo"
            triggerIcon="ph-plus"
            action="/ai-summaries"
            submitLabel="Gerar Resumo"
            submitIcon="ph-sparkle"
            large
          >
            <div {...{ "x-data": `{ summary_type: 'case' }` }}>
              <div class="flex flex-col gap-1">
                <label for="summary_type" class="text-body-sm font-semibold text-gray-700">
                  Tipo de Resumo<span class="text-status-red"> *</span>
                </label>
                <select id="summary_type" name="summary_type" required class="input" {...{ "x-model": "summary_type" }}>
                  <option value="case" selected>Resumo de Processo</option>
                  <option value="petition">Resumo de Peticao</option>
                  <option value="decision">Explicacao de Decisao</option>
                  <option value="hearing">Resumo de Audiencia</option>
                  <option value="proceeding">Resumo de Andamento</option>
                </select>
              </div>
              <ComboBox
                label="Processo"
                id="case_id"
                name="case_id"
                required
                icon="ph-folder"
                options={caseOptions}
              />
              <div {...{ "x-show": "summary_type !== 'case'" }} x-cloak>
                <Textarea
                  label="Contexto adicional"
                  id="additional_context"
                  name="additional_context"
                  rows={6}
                >Cole aqui o texto da peticao, decisao, ata de audiencia ou andamento a ser resumido...</Textarea>
              </div>
            </div>
          </Modal>
        )}
      />
      <form method="get" action="/ai-summaries" class="mb-4 flex gap-4 items-end">
        <TextField label="Buscar" id="search" name="search" type="text" value={search} placeholder="Texto do resumo..." icon="ph-magnifying-glass" />
        <button type="submit" class="btn btn-secondary inline-flex items-center gap-1"><i class="ph ph-funnel" aria-hidden="true"></i>Filtrar</button>
      </form>
      <Table
        columns={[
          { label: "Tipo" },
          { label: "Processo" },
          { label: "Resumo" },
          { label: "Data" },
          { label: "Acoes", align: "center" },
        ]}
        rows={rows}
        emptyMsg="Nenhum resumo gerado ainda."
        emptyIcon="ph-sparkle"
        ariaLabel="Lista de resumos com IA"
        count={count ?? 0}
        countLabel="resumo(s)"
        pagination={{
          currentPage: page,
          totalPages,
          basePath: "/ai-summaries",
          queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        }}
      />
    </>,
  );
});

// --- POST / -- generate summary using OpenAI ---

const summarySchema = z.object({
  summary_type: z.enum(["case", "petition", "decision", "hearing", "proceeding"]),
  case_id: z.string().uuid("Processo invalido"),
  additional_context: z.string().optional(),
});

aiSummariesRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = summarySchema.safeParse(body);
  if (!parsed.success) return c.redirect("/ai-summaries");

  const { summary_type, case_id, additional_context } = parsed.data;

  // Fetch case data.
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, title, description, case_number, case_type, status, opposing_party, judge, tribunal, phase, cause_value_cents")
    .eq("id", case_id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!caseRow) return c.redirect("/ai-summaries");

  const causeValue = caseRow.cause_value_cents
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(caseRow.cause_value_cents / 100)
    : "Nao informado";

  const caseInfo = [
    `Titulo: ${caseRow.title}`,
    `Numero: ${caseRow.case_number ?? "Nao informado"}`,
    `Tipo: ${caseRow.case_type}`,
    `Status: ${caseRow.status}`,
    `Tribunal: ${caseRow.tribunal ?? "Nao informado"}`,
    `Juiz: ${caseRow.judge ?? "Nao informado"}`,
    `Parte contraria: ${caseRow.opposing_party ?? "Nao informado"}`,
    `Fase: ${caseRow.phase ?? "Nao informado"}`,
    `Valor da causa: ${causeValue}`,
    `Descricao: ${caseRow.description ?? "Nao informado"}`,
  ].join("\n");

  const systemPrompt =
    "Voce e um assistente juridico brasileiro. Gere um resumo claro e estruturado em portugues. Use linguagem acessivel mas tecnicamente correta.";

  let userPrompt = "";
  if (summary_type === "case") {
    userPrompt = `Gere um resumo estruturado e completo do seguinte processo juridico, incluindo os principais pontos, partes envolvidas, fase atual e proximos passos recomendados:\n\n${caseInfo}`;
  } else {
    const typeInstruction: Record<string, string> = {
      petition: "Gere um resumo estruturado da seguinte peticao, destacando os pedidos, fundamentos juridicos e pontos relevantes.",
      decision: "Explique a seguinte decisao judicial de forma clara, destacando o dispositivo, fundamentos e impactos para as partes.",
      hearing: "Gere um resumo estruturado da seguinte audiencia, destacando os fatos ocorridos, depoimentos e decisoes proferidas.",
      proceeding: "Gere um resumo estruturado do seguinte andamento processual, destacando o evento, data e impactos no processo.",
    };
    userPrompt = `${typeInstruction[summary_type]}\n\nDados do processo:\n${caseInfo}\n\nContexto adicional:\n${additional_context ?? "Nao informado"}`;
  }

  if (!checkRateLimit(user.tenantId)) {
    return c.redirect("/ai-summaries");
  }

  const config = await getTenantLLMConfig(user.tenantId);
  if (!config) {
    return c.redirect("/ai-summaries");
  }

  const { reply, tokens } = await callLLM(systemPrompt, userPrompt, config);

  const { data, error } = await supabase
    .from("ai_summaries")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      case_id,
      summary_type,
      summary_text: reply,
      model: config.model,
      tokens_used: tokens,
    })
    .select("id")
    .single();

  if (error || !data) return c.redirect("/ai-summaries");
  return c.redirect(`/ai-summaries/${data.id}`);
});

// --- GET /:id -- show the summary ---

aiSummariesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: summary } = await supabase
    .from("ai_summaries")
    .select("id, summary_type, summary_text, model, tokens_used, created_at, case_id, cases(id, title)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!summary) return c.redirect("/ai-summaries");

  const caseData = summary.cases as unknown as { id: string; title: string } | null;

  return renderPage(
    c,
    { title: "Resumo", active: "ai-summaries" },
    <>
      <PageHeader
        title={SUMMARY_TYPE_LABELS[summary.summary_type] ?? summary.summary_type}
        icon="ph-sparkle"
        actions={() => (
          <div class="flex gap-2">
            <a href="/ai-summaries" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-sparkle" aria-hidden="true"></i>Gerar Novo
            </a>
            <a href="/ai-summaries" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
            </a>
          </div>
        )}
      />

      <div class="mb-4">
        <Panel title="Detalhes" icon="ph-info">
          <div class="flex flex-col gap-2 text-body-sm text-gray-700">
            <div class="flex items-center gap-2">
              <i class="ph ph-tag text-[#0568ff]" aria-hidden="true"></i>
              <span class="font-semibold">Tipo:</span>
              <Badge color="blue" icon="ph-sparkle">{SUMMARY_TYPE_LABELS[summary.summary_type] ?? summary.summary_type}</Badge>
            </div>
            {caseData ? (
              <div class="flex items-center gap-2">
                <i class="ph ph-folder text-[#0568ff]" aria-hidden="true"></i>
                <span class="font-semibold">Processo:</span>
                <a href={`/cases/${caseData.id}`} class="text-[#0568ff] hover:underline">{caseData.title}</a>
              </div>
            ) : null}
            <div class="flex items-center gap-2">
              <i class="ph ph-calendar text-[#0568ff]" aria-hidden="true"></i>
              <span class="font-semibold">Data:</span>
              {formatDateTime(summary.created_at)}
            </div>
            <div class="flex items-center gap-2">
              <i class="ph ph-cpu text-[#0568ff]" aria-hidden="true"></i>
              <span class="font-semibold">Modelo:</span>
              {summary.model ?? "gpt-4o-mini"}
            </div>
            <div class="flex items-center gap-2">
              <i class="ph ph-coins text-[#0568ff]" aria-hidden="true"></i>
              <span class="font-semibold">Tokens:</span>
              {summary.tokens_used ?? 0}
            </div>
          </div>
        </Panel>
      </div>

      <div class="mb-4">
        <Panel title="Resumo Gerado" icon="ph-text-aa">
          <div class="text-body text-gray-800 font-serif leading-relaxed" style="white-space: pre-wrap; word-break: break-word;">
            {summary.summary_text}
          </div>
        </Panel>
      </div>

      <Panel>
        <form method="post" action={`/ai-summaries/${id}/delete`} class="flex gap-2">
          <button type="submit" class="btn btn-danger inline-flex items-center gap-1"
            onclick="return confirm('Excluir este resumo?')" aria-label="Excluir">
            <i class="ph ph-trash" aria-hidden="true"></i>Excluir
          </button>
          <a href="/ai-summaries" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-list" aria-hidden="true"></i>Listagem
          </a>
        </form>
      </Panel>
    </>,
  );
});

// --- POST /:id/delete -- delete summary ---

aiSummariesRoutes.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  await supabase
    .from("ai_summaries")
    .delete()
    .eq("id", id)
    .eq("tenant_id", user.tenantId);

  return c.redirect("/ai-summaries");
});
