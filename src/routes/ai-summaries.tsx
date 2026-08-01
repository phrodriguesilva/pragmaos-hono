import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { PageHeader, Table, Select, Textarea, Panel, Badge } from "../components/ui";

export const aiSummariesRoutes = new Hono<AppEnv>();

aiSummariesRoutes.use("*", requireAuth);

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

// Call OpenAI chat completions API using fetch.
async function callOpenAI(messages: { role: string; content: string }[]): Promise<{ reply: string; tokens: number }> {
  if (!process.env.OPENAI_API_KEY) {
    return { reply: "IA nao configurada. Defina OPENAI_API_KEY no ambiente.", tokens: 0 };
  }
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      return { reply: `Erro da API de IA (${resp.status}): ${body.slice(0, 200)}`, tokens: 0 };
    }
    const data = (await resp.json()) as {
      choices?: { message: { content: string } }[];
      usage?: { total_tokens: number };
    };
    const reply = data.choices?.[0]?.message?.content ?? "Erro ao gerar resposta.";
    const tokens = data.usage?.total_tokens ?? 0;
    return { reply, tokens };
  } catch (err) {
    return { reply: `Erro ao chamar a API de IA: ${String(err)}`, tokens: 0 };
  }
}

// --- GET / -- list of generated summaries ---

aiSummariesRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: summaries } = await supabase
    .from("ai_summaries")
    .select("id, summary_type, summary_text, model, created_at, cases(title)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (summaries ?? []).map((s) => {
    const caseTitle = (s.cases as unknown as { title: string } | null)?.title ?? "-";
    return [
      <Badge color="blue" icon="ph-sparkle">{SUMMARY_TYPE_LABELS[s.summary_type] ?? s.summary_type}</Badge> as unknown as string,
      caseTitle,
      (s.summary_text ?? "").slice(0, 100),
      formatDate(s.created_at),
      <a href={`/ai-summaries/${s.id}`} class="text-terracota-600 hover:underline inline-flex items-center gap-1">
        <i class="ph ph-eye" aria-hidden="true"></i>Ver
      </a> as unknown as string,
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
          <a href="/ai-summaries/new" class="btn btn-primary inline-flex items-center gap-1">
            <i class="ph ph-plus" aria-hidden="true"></i>Gerar Novo Resumo
          </a>
        )}
      />
      <Table
        columns={[
          { label: "Tipo" },
          { label: "Processo" },
          { label: "Resumo" },
          { label: "Data" },
          { label: "", align: "center" },
        ]}
        rows={rows}
        emptyMsg="Nenhum resumo gerado ainda."
        emptyIcon="ph-sparkle"
        ariaLabel="Lista de resumos com IA"
      />
    </>,
  );
});

// --- GET /new -- form to generate a new summary ---

aiSummariesRoutes.get("/new", async (c) => {
  const user = c.get("user");
  const summaryType = c.req.query("type") ?? "case";

  const { data: cases } = await supabase
    .from("cases")
    .select("id, title")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  const isCaseType = summaryType === "case";

  return renderPage(
    c,
    { title: "Gerar Resumo", active: "ai-summaries" },
    <>
      <PageHeader
        title="Gerar Resumo"
        icon="ph-sparkle"
        actions={() => (
          <a href="/ai-summaries" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />
      <Panel>
        <form method="post" action="/ai-summaries" class="flex flex-col gap-4">
          <Select
            label="Tipo de Resumo"
            id="summary_type"
            name="summary_type"
            required
            selected={summaryType}
            options={[
              { value: "case", label: "Resumo de Processo" },
              { value: "petition", label: "Resumo de Peticao" },
              { value: "decision", label: "Explicacao de Decisao" },
              { value: "hearing", label: "Resumo de Audiencia" },
              { value: "proceeding", label: "Resumo de Andamento" },
            ]}
          />
          <Select
            label="Processo"
            id="case_id"
            name="case_id"
            required
            icon="ph-folder"
            options={(cases ?? []).map((cs) => ({ value: cs.id, label: cs.title }))}
          />
          {isCaseType ? (
            <div class="text-body-sm text-gray-500 flex items-center gap-2">
              <i class="ph ph-info" aria-hidden="true"></i>
              O resumo sera gerado a partir dos dados do processo selecionado.
            </div>
          ) : (
            <Textarea
              label="Contexto adicional"
              id="additional_context"
              name="additional_context"
              rows={6}
            >Cole aqui o texto da peticao, decisao, ata de audiencia ou andamento a ser resumido...</Textarea>
          )}
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-sparkle" aria-hidden="true"></i>Gerar Resumo
            </button>
            <a href="/ai-summaries" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-x" aria-hidden="true"></i>Cancelar
            </a>
          </div>
        </form>
      </Panel>
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
  if (!parsed.success) return c.redirect("/ai-summaries/new");

  const { summary_type, case_id, additional_context } = parsed.data;

  // Fetch case data.
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, title, description, case_number, case_type, status, opposing_party, judge, tribunal, phase, cause_value_cents")
    .eq("id", case_id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!caseRow) return c.redirect("/ai-summaries/new");

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

  const { reply, tokens } = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const { data, error } = await supabase
    .from("ai_summaries")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      case_id,
      summary_type,
      summary_text: reply,
      model: "gpt-4o-mini",
      tokens_used: tokens,
    })
    .select("id")
    .single();

  if (error || !data) return c.redirect("/ai-summaries/new");
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
            <a href="/ai-summaries/new" class="btn btn-primary inline-flex items-center gap-1">
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
              <i class="ph ph-tag text-carvao-600" aria-hidden="true"></i>
              <span class="font-semibold">Tipo:</span>
              <Badge color="blue" icon="ph-sparkle">{SUMMARY_TYPE_LABELS[summary.summary_type] ?? summary.summary_type}</Badge>
            </div>
            {caseData ? (
              <div class="flex items-center gap-2">
                <i class="ph ph-folder text-carvao-600" aria-hidden="true"></i>
                <span class="font-semibold">Processo:</span>
                <a href={`/cases/${caseData.id}`} class="text-terracota-600 hover:underline">{caseData.title}</a>
              </div>
            ) : null}
            <div class="flex items-center gap-2">
              <i class="ph ph-calendar text-carvao-600" aria-hidden="true"></i>
              <span class="font-semibold">Data:</span>
              {formatDateTime(summary.created_at)}
            </div>
            <div class="flex items-center gap-2">
              <i class="ph ph-cpu text-carvao-600" aria-hidden="true"></i>
              <span class="font-semibold">Modelo:</span>
              {summary.model ?? "gpt-4o-mini"}
            </div>
            <div class="flex items-center gap-2">
              <i class="ph ph-coins text-carvao-600" aria-hidden="true"></i>
              <span class="font-semibold">Tokens:</span>
              {summary.tokens_used ?? 0}
            </div>
          </div>
        </Panel>
      </div>

      <div class="mb-4">
        <Panel title="Resumo Gerado" icon="ph-text-aa">
          <div class="text-body text-gray-800" style="white-space: pre-wrap; word-break: break-word;">
            {summary.summary_text}
          </div>
        </Panel>
      </div>

      <Panel>
        <form method="post" action={`/ai-summaries/${id}/delete`} class="flex gap-2">
          <button type="submit" class="btn btn-danger inline-flex items-center gap-1"
            onclick="return confirm('Excluir este resumo?')">
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
