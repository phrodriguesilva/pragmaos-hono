import { Hono } from "hono";
import type { AppEnv } from "../lib/types";

import { z } from "zod";
import { requireAuth } from "../lib/session";
import { renderPage } from "../lib/render";
import { supabase } from "../lib/supabase";
import { AI_API_KEY, AI_BASE_URL, AI_MODEL } from "../lib/env";
import { PageHeader, Table, TextField, Select, ComboBox, Textarea, Panel, Badge, Modal } from "../components/ui";

export const aiChatRoutes = new Hono<AppEnv>();

aiChatRoutes.use("*", requireAuth);

// --- Helpers ---

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

// Call OpenAI-compatible chat completions API using fetch.
async function callOpenAI(messages: { role: string; content: string }[]): Promise<{ reply: string; tokens: number }> {
  if (!AI_API_KEY) {
    return { reply: "IA nao configurada. Defina AI_API_KEY no ambiente.", tokens: 0 };
  }
  try {
    const resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: AI_MODEL, messages }),
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

// --- GET / -- list conversations ---

aiChatRoutes.get("/", async (c) => {
  const user = c.get("user");

  const { data: conversations } = await supabase
    .from("ai_conversations")
    .select("id, title, model, case_id, created_at, cases(title)")
    .eq("tenant_id", user.tenantId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Fetch last message per conversation.
  const convIds = (conversations ?? []).map((cv) => cv.id);
  const { data: lastMessages } = await supabase
    .from("ai_messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(100);

  const lastByConv = new Map<string, string>();
  for (const m of lastMessages ?? []) {
    if (!lastByConv.has(m.conversation_id)) {
      lastByConv.set(m.conversation_id, m.content);
    }
  }

  const rows = (conversations ?? []).map((cv) => {
    const caseTitle = (cv.cases as unknown as { title: string } | null)?.title;
    return [
      <a href={`/ai-chat/${cv.id}`} class="text-terracota-600 hover:underline">{cv.title}</a> as unknown as string,
      cv.model ?? AI_MODEL,
      (lastByConv.get(cv.id) ?? "-").slice(0, 80),
      caseTitle ? <Badge color="blue" icon="ph-folder">{caseTitle}</Badge> as unknown as string : "-",
      formatDate(cv.created_at),
    ];
  });

  return renderPage(
    c,
    { title: "Assistente Juridico", active: "ai-assistant" },
    <>
      <PageHeader
        title="Assistente Juridico"
        icon="ph-chats-teardrop"
        actions={() => (
          <Modal
            id="new-conversation"
            title="Nova Conversa"
            icon="ph-chats-teardrop"
            triggerText="Nova Conversa"
            triggerIcon="ph-plus"
            action="/ai-chat"
            submitLabel="Criar"
          >
            <TextField label="Titulo" id="title" name="title" required icon="ph-text-aa" placeholder="Titulo da conversa" />
            <Select label="Modelo" id="model" name="model"
              options={[
                { value: "gpt-4o-mini", label: "GPT-4o mini" },
                { value: "gpt-4o", label: "GPT-4o" },
                { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
              ]}
            />
          </Modal>
        )}
      />
      <Table
        columns={[
          { label: "Titulo" },
          { label: "Modelo" },
          { label: "Ultima mensagem" },
          { label: "Processo" },
          { label: "Data" },
        ]}
        rows={rows}
        emptyMsg="Nenhuma conversa iniciada."
        emptyIcon="ph-chats-teardrop"
        ariaLabel="Lista de conversas"
      />
    </>,
  );
});

// --- POST / -- create conversation ---

const conversationSchema = z.object({
  title: z.string().min(1, "Titulo e obrigatorio"),
  case_id: z.string().optional(),
});

aiChatRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const parsed = conversationSchema.safeParse(body);
  if (!parsed.success) return c.redirect("/ai-chat");

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      title: parsed.data.title,
      case_id: parsed.data.case_id || null,
      model: AI_MODEL,
    })
    .select("id")
    .single();

  if (error || !data) return c.redirect("/ai-chat");
  return c.redirect(`/ai-chat/${data.id}`);
});

// --- GET /:id -- chat interface ---

aiChatRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: conv } = await supabase
    .from("ai_conversations")
    .select("id, title, model, case_id, created_at, cases(title, case_number, case_type, status, description)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!conv) return c.redirect("/ai-chat");

  const { data: messages } = await supabase
    .from("ai_messages")
    .select("id, role, content, tokens_used, created_at")
    .eq("conversation_id", id)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: true });

  const caseData = conv.cases as unknown as {
    title: string;
    case_number?: string;
    case_type: string;
    status: string;
    description?: string;
  } | null;

  return renderPage(
    c,
    { title: conv.title, active: "ai-assistant" },
    <>
      <PageHeader title={conv.title} icon="ph-chats-teardrop"
        actions={() => (
          <a href="/ai-chat" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Voltar
          </a>
        )}
      />

      {caseData ? (
        <div class="mb-4">
          <Panel title="Contexto do Processo" icon="ph-folder">
            <div class="text-body-sm text-gray-600">
              <p><strong>{caseData.title}</strong></p>
              {caseData.case_number ? <p>Numero: {caseData.case_number}</p> : null}
              <p>Tipo: {caseData.case_type} | Status: {caseData.status}</p>
              {caseData.description ? <p class="mt-2">{caseData.description}</p> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      <div class="border border-border bg-white mb-4" style="height: 400px; overflow-y: auto;">
        <div class="p-4 flex flex-col gap-3">
          {(messages ?? []).length === 0 ? (
            <div class="text-center text-gray-500 py-8">
              <i class="ph ph-chats-teardrop text-h2 block mb-2 text-gray-300" aria-hidden="true"></i>
              Nenhuma mensagem ainda. Envie a primeira mensagem abaixo.
            </div>
          ) : (
            (messages ?? []).map((m) => (
              <div class={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  class={`max-w-[75%] px-3 py-2 ${m.role === "user" ? "bg-carvao-700 text-white" : "bg-gray-100 text-gray-800"}`}
                  style="white-space: pre-wrap; word-break: break-word;"
                >
                  <div class="text-body-sm font-semibold mb-1">
                    {m.role === "user" ? "Voce" : "Assistente"}
                  </div>
                  {m.content}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Panel>
        <form method="post" action={`/ai-chat/${id}`} class="flex flex-col gap-3">
          <Textarea label="Mensagem" id="content" name="content" rows={3} required>Digite sua mensagem...</Textarea>
          <div class="flex gap-2">
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-paper-plane-tilt" aria-hidden="true"></i>Enviar
            </button>
            <a href="/ai-chat" class="btn btn-secondary inline-flex items-center gap-1">
              <i class="ph ph-x" aria-hidden="true"></i>Fechar
            </a>
          </div>
        </form>
      </Panel>
    </>,
  );
});

// --- POST /:id -- send message ---

aiChatRoutes.post("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const content = String(body.content ?? "").trim();
  if (!content) return c.redirect(`/ai-chat/${id}`);

  // Verify conversation belongs to tenant.
  const { data: conv } = await supabase
    .from("ai_conversations")
    .select("id, case_id, cases(title, case_number, case_type, status, description)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!conv) return c.redirect("/ai-chat");

  // Insert user message.
  await supabase.from("ai_messages").insert({
    tenant_id: user.tenantId,
    conversation_id: id,
    role: "user",
    content,
    tokens_used: 0,
  });

  // Fetch full conversation history.
  const { data: history } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", id)
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: true });

  const caseData = conv.cases as unknown as {
    title: string;
    case_number?: string;
    case_type: string;
    status: string;
    description?: string;
  } | null;

  // Build system prompt with optional case context.
  let systemPrompt = "Voce e um assistente juridico brasileiro especializado em direito. Responda de forma clara, profissional e em portugues. Sempre oriente buscar um advogado para casos especificos.";
  if (caseData) {
    systemPrompt += `\n\nContexto do processo vinculado:\nTitulo: ${caseData.title}`;
    if (caseData.case_number) systemPrompt += `\nNumero: ${caseData.case_number}`;
    systemPrompt += `\nTipo: ${caseData.case_type}\nStatus: ${caseData.status}`;
    if (caseData.description) systemPrompt += `\nDescricao: ${caseData.description}`;
  }

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...((history ?? []).map((h) => ({ role: h.role, content: h.content }))),
  ];

  const { reply, tokens } = await callOpenAI(apiMessages);

  // Insert assistant response.
  await supabase.from("ai_messages").insert({
    tenant_id: user.tenantId,
    conversation_id: id,
    role: "assistant",
    content: reply,
    tokens_used: tokens,
  });

  // Log to ai_interactions.
  await supabase.from("ai_interactions").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    case_id: conv.case_id || null,
    interaction_type: "chat",
    input_text: content,
    output_text: reply,
    model: AI_MODEL,
    tokens_used: tokens,
  });

  return c.redirect(`/ai-chat/${id}`);
});

// --- GET /jurisprudence -- search form ---

aiChatRoutes.get("/jurisprudence", async (c) => {
  const user = c.get("user");
  const query = c.req.query("q") ?? "";
  const tribunal = c.req.query("tribunal") ?? "";

  // Fetch recent searches.
  const { data: recent } = await supabase
    .from("jurisprudence_searches")
    .select("id, query, tribunal, result_text, created_at")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentRows = (recent ?? []).map((r) => [
    r.query,
    r.tribunal ?? "-",
    formatDate(r.created_at),
    <a href={`/ai-chat/jurisprudence/result/${r.id}`} class="text-terracota-600 hover:underline">Ver resultado</a> as unknown as string,
  ]);

  return renderPage(
    c,
    { title: "Jurisprudencia", active: "ai-jurisprudence" },
    <>
      <PageHeader title="Jurisprudencia" icon="ph-scales" />

      <div class="mb-6">
        <Panel title="Buscar Jurisprudencia" icon="ph-magnifying-glass">
          <form method="post" action="/ai-chat/jurisprudence" class="flex flex-col gap-4">
            <TextField label="Consulta" id="query" name="query" required icon="ph-magnifying-glass" placeholder="Ex: indenizacao por dano moral" value={query} />
            <Select label="Tribunal" id="tribunal" name="tribunal" selected={tribunal}
              options={[
                { value: "", label: "Todos" },
                { value: "STF", label: "STF" },
                { value: "STJ", label: "STJ" },
                { value: "TJSP", label: "TJSP" },
                { value: "TJRJ", label: "TJRJ" },
                { value: "TRF1", label: "TRF1" },
                { value: "TRF2", label: "TRF2" },
                { value: "TRF3", label: "TRF3" },
                { value: "TRF4", label: "TRF4" },
                { value: "TRF5", label: "TRF5" },
                { value: "TRF6", label: "TRF6" },
              ]}
            />
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-magnifying-glass" aria-hidden="true"></i>Buscar
            </button>
          </form>
        </Panel>
      </div>

      <Panel title="Buscas Recentes" icon="ph-clock">
        <Table
          columns={[{ label: "Consulta" }, { label: "Tribunal" }, { label: "Data" }, { label: "Acao" }]}
          rows={recentRows}
          emptyMsg="Nenhuma busca realizada."
          emptyIcon="ph-clock"
          ariaLabel="Buscas recentes de jurisprudencia"
        />
      </Panel>
    </>,
  );
});

// --- POST /jurisprudence -- process search ---

aiChatRoutes.post("/jurisprudence", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const query = String(body.query ?? "").trim();
  const tribunal = String(body.tribunal ?? "").trim();
  if (!query) return c.redirect("/ai-chat/jurisprudence");

  const systemPrompt =
    "Voce e um assistente juridico brasileiro especializado em jurisprudencia. Analise a consulta e forneca um resumo dos entendimentos jurisprudenciais mais relevantes, citando teses e principios. Se um tribunal for especificado, foque na jurisprudencia daquele tribunal. Use linguagem tecnica em portugues.";

  const userPrompt = `Consulta: ${query}${tribunal ? `\nTribunal: ${tribunal}` : ""}\n\nForneca uma analise jurisprudencial estruturada com: 1) Teses predominantes, 2) Entendimentos divergentes, 3) Precedentes relevantes (se conhecidos), 4) Recomendacoes.`;

  const { reply, tokens } = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  // Save to jurisprudence_searches.
  const { data } = await supabase
    .from("jurisprudence_searches")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      query,
      tribunal: tribunal || null,
      result_text: reply,
      model: AI_MODEL,
      tokens_used: tokens,
    })
    .select("id")
    .single();

  // Log to ai_interactions.
  await supabase.from("ai_interactions").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    interaction_type: "jurisprudence_search",
    input_text: query,
    output_text: reply,
    model: AI_MODEL,
    tokens_used: tokens,
  });

  if (data) return c.redirect(`/ai-chat/jurisprudence/result/${data.id}`);
  return c.redirect("/ai-chat/jurisprudence");
});

// --- GET /jurisprudence/result/:id -- show search result ---

aiChatRoutes.get("/jurisprudence/result/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: search } = await supabase
    .from("jurisprudence_searches")
    .select("id, query, tribunal, result_text, model, tokens_used, created_at")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!search) return c.redirect("/ai-chat/jurisprudence");

  return renderPage(
    c,
    { title: "Resultado da Busca", active: "ai-jurisprudence" },
    <>
      <PageHeader title="Resultado da Busca" icon="ph-scales"
        actions={() => (
          <a href="/ai-chat/jurisprudence" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Nova Busca
          </a>
        )}
      />
      <Panel title={`Consulta: ${search.query}`} icon="ph-magnifying-glass">
        <div class="mb-4 flex items-center gap-3">
          {search.tribunal ? <Badge color="blue" icon="ph-court">{search.tribunal}</Badge> : null}
          <Badge color="gray" icon="ph-cpu">{search.model ?? AI_MODEL}</Badge>
          <span class="text-body-sm text-gray-500">{formatDateTime(search.created_at)}</span>
        </div>
        <div class="text-body text-gray-800" style="white-space: pre-wrap; word-break: break-word;">
          {search.result_text}
        </div>
      </Panel>
    </>,
  );
});

// --- GET /petitions -- petition generator form ---

aiChatRoutes.get("/petitions", async (c) => {
  const user = c.get("user");
  const { data: cases } = await supabase
    .from("cases")
    .select("id, title, case_number, case_type, tribunal, status, description, clients(name, cpf, cnpj)")
    .eq("tenant_id", user.tenantId)
    .is("deleted_at", null)
    .order("title");

  // Fetch recent petitions.
  const { data: recent } = await supabase
    .from("ai_petitions")
    .select("id, petition_type, case_id, created_at, cases(title)")
    .eq("tenant_id", user.tenantId)
    .order("created_at", { ascending: false })
    .limit(5);

  const recentRows = (recent ?? []).map((p) => {
    const caseTitle = (p.cases as unknown as { title: string } | null)?.title ?? "-";
    const typeLabels: Record<string, string> = {
      inicial: "Inicial",
      contestacao: "Contestacao",
      recurso: "Recurso",
      "peticao-intermediaria": "Peticao Intermediaria",
    };
    return [
      typeLabels[p.petition_type] ?? p.petition_type,
      caseTitle,
      formatDate(p.created_at),
      <a href={`/ai-chat/petitions/result/${p.id}`} class="text-terracota-600 hover:underline">Ver peticao</a> as unknown as string,
    ];
  });

  return renderPage(
    c,
    { title: "Gerador de Peticoes", active: "ai-petitions" },
    <>
      <PageHeader title="Gerador de Peticoes" icon="ph-file-text" />

      <div class="mb-6">
        <Panel title="Gerar Peticao" icon="ph-file-arrow-up">
          <form method="post" action="/ai-chat/petitions" class="flex flex-col gap-4">
            <ComboBox label="Processo" id="case_id" name="case_id" required
              options={(cases ?? []).map((cs) => ({
                value: cs.id,
                label: `${cs.title}${cs.case_number ? ` (${cs.case_number})` : ""}`,
              }))}
            />
            <Select label="Tipo de Peticao" id="petition_type" name="petition_type" required
              options={[
                { value: "inicial", label: "Peticao Inicial" },
                { value: "contestacao", label: "Contestacao" },
                { value: "recurso", label: "Recurso" },
                { value: "peticao-intermediaria", label: "Peticao Intermediaria" },
              ]}
            />
            <Textarea label="Instrucoes adicionais (opcional)" id="instructions" name="instructions" rows={3}>Ex: destacar pedido liminar, enfatizar dano moral...</Textarea>
            <button type="submit" class="btn btn-primary inline-flex items-center gap-1">
              <i class="ph ph-sparkle" aria-hidden="true"></i>Gerar Peticao
            </button>
          </form>
        </Panel>
      </div>

      <Panel title="Peticoes Recentes" icon="ph-clock">
        <Table
          columns={[{ label: "Tipo" }, { label: "Processo" }, { label: "Data" }, { label: "Acao" }]}
          rows={recentRows}
          emptyMsg="Nenhuma peticao gerada."
          emptyIcon="ph-file-text"
          ariaLabel="Peticoes recentes"
        />
      </Panel>
    </>,
  );
});

// --- POST /petitions -- generate petition ---

aiChatRoutes.post("/petitions", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const caseId = String(body.case_id ?? "");
  const petitionType = String(body.petition_type ?? "");
  const instructions = String(body.instructions ?? "").trim();
  if (!caseId || !petitionType) return c.redirect("/ai-chat/petitions");

  // Fetch case data with client info.
  const { data: caseData } = await supabase
    .from("cases")
    .select("id, title, case_number, case_type, tribunal, status, description, judge, district, court_branch, opposing_party, clients(name, cpf, cnpj)")
    .eq("id", caseId)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!caseData) return c.redirect("/ai-chat/petitions");

  const client = caseData.clients as unknown as { name: string; cpf?: string; cnpj?: string } | null;
  const typeLabels: Record<string, string> = {
    inicial: "Peticao Inicial",
    contestacao: "Contestacao",
    recurso: "Recurso",
    "peticao-intermediaria": "Peticao Intermediaria",
  };

  let userPrompt = `Gere uma ${typeLabels[petitionType] ?? petitionType} para o seguinte processo:\n\n`;
  userPrompt += `Titulo: ${caseData.title}\n`;
  if (caseData.case_number) userPrompt += `Numero do processo: ${caseData.case_number}\n`;
  userPrompt += `Tipo: ${caseData.case_type}\n`;
  if (caseData.tribunal) userPrompt += `Tribunal: ${caseData.tribunal}\n`;
  userPrompt += `Status: ${caseData.status}\n`;
  if (caseData.description) userPrompt += `Descricao: ${caseData.description}\n`;
  if (caseData.judge) userPrompt += `Juiz: ${caseData.judge}\n`;
  if (caseData.district) userPrompt += `Comarca: ${caseData.district}\n`;
  if (caseData.court_branch) userPrompt += `Vara: ${caseData.court_branch}\n`;
  if (caseData.opposing_party) userPrompt += `Parte contraria: ${caseData.opposing_party}\n`;
  if (client) {
    userPrompt += `\nCliente:\nNome: ${client.name}\n`;
    if (client.cpf) userPrompt += `CPF: ${client.cpf}\n`;
    if (client.cnpj) userPrompt += `CNPJ: ${client.cnpj}\n`;
  }
  if (instructions) userPrompt += `\nInstrucoes adicionais: ${instructions}\n`;
  userPrompt += `\nGere a peticao em formato juridico formal, com enderecamento, fatos, fundamentos e pedidos.`;

  const systemPrompt =
    "Voce e um advogado brasileiro especializado em redacao de peticoes judiciais. Gere peticoes em formato juridico formal, seguindo as melhores praticas do direito brasileiro. Use linguagem tecnica adequada e estrutura correta para o tipo de peticao solicitado.";

  const { reply, tokens } = await callOpenAI([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  // Save to ai_petitions.
  const { data } = await supabase
    .from("ai_petitions")
    .insert({
      tenant_id: user.tenantId,
      user_id: user.id,
      case_id: caseId,
      petition_type: petitionType,
      content: reply,
      model: AI_MODEL,
      tokens_used: tokens,
    })
    .select("id")
    .single();

  // Log to ai_interactions.
  await supabase.from("ai_interactions").insert({
    tenant_id: user.tenantId,
    user_id: user.id,
    case_id: caseId,
    interaction_type: "petition_generation",
    input_text: `${typeLabels[petitionType] ?? petitionType} - ${caseData.title}`,
    output_text: reply,
    model: AI_MODEL,
    tokens_used: tokens,
  });

  if (data) return c.redirect(`/ai-chat/petitions/result/${data.id}`);
  return c.redirect("/ai-chat/petitions");
});

// --- GET /petitions/result/:id -- show generated petition ---

aiChatRoutes.get("/petitions/result/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const { data: petition } = await supabase
    .from("ai_petitions")
    .select("id, petition_type, content, model, tokens_used, created_at, cases(title)")
    .eq("id", id)
    .eq("tenant_id", user.tenantId)
    .single();

  if (!petition) return c.redirect("/ai-chat/petitions");

  const caseTitle = (petition.cases as unknown as { title: string } | null)?.title ?? "-";
  const typeLabels: Record<string, string> = {
    inicial: "Peticao Inicial",
    contestacao: "Contestacao",
    recurso: "Recurso",
    "peticao-intermediaria": "Peticao Intermediaria",
  };

  return renderPage(
    c,
    { title: "Peticao Gerada", active: "ai-petitions" },
    <>
      <PageHeader title={typeLabels[petition.petition_type] ?? petition.petition_type} icon="ph-file-text"
        actions={() => (
          <a href="/ai-chat/petitions" class="btn btn-secondary inline-flex items-center gap-1">
            <i class="ph ph-arrow-left" aria-hidden="true"></i>Nova Peticao
          </a>
        )}
      />
      <Panel title={`Processo: ${caseTitle}`} icon="ph-folder">
        <div class="mb-4 flex items-center gap-3">
          <Badge color="blue" icon="ph-file-text">{typeLabels[petition.petition_type] ?? petition.petition_type}</Badge>
          <Badge color="gray" icon="ph-cpu">{petition.model ?? AI_MODEL}</Badge>
          <span class="text-body-sm text-gray-500">{formatDateTime(petition.created_at)}</span>
        </div>
        <div class="text-body text-gray-800" style="white-space: pre-wrap; word-break: break-word;">
          {petition.content}
        </div>
      </Panel>
    </>,
  );
});
