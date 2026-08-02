// AI services for PragmaOS.
// - PII masking before sending to LLM (LGPD compliance).
// - Case summary generation.
// - Movement translation/explanation.
// - Next steps suggestion.
// - Shared callLLM for all modules (ai-chat, ai-summaries, cases, proceedings).
// Uses an OpenAI-compatible API.
// Supports per-tenant LLM config (from integrations table) with fallback to global env vars.

import { AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_RATE_LIMIT_PER_TENANT } from "./env";
import { fetchWithTimeout } from "./fetch-with-timeout";

// --- LLM config type ---

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

// --- PII Masking ---

export type ClientPII = {
  name: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  address?: string;
};

type MaskResult = {
  maskedText: string;
  maskMap: Map<string, string>; // placeholder -> original
};

// Mask PII by replacing each value with a placeholder token.
export function maskPII(text: string, pii: ClientPII): MaskResult {
  const maskMap = new Map<string, string>();
  let masked = text;

  const maskValue = (value: string | undefined, token: string) => {
    if (!value) return;
    // Escape regex special chars in the value.
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    masked = masked.replace(new RegExp(escaped, "g"), token);
    maskMap.set(token, value);
  };

  maskValue(pii.name, "[NOME_CLIENTE]");
  maskValue(pii.cpf, "[CPF_CLIENTE]");
  maskValue(pii.cnpj, "[CNPJ_CLIENTE]");
  maskValue(pii.email, "[EMAIL_CLIENTE]");
  maskValue(pii.phone, "[TELEFONE_CLIENTE]");
  maskValue(pii.address, "[ENDERECO_CLIENTE]");

  return { maskedText: masked, maskMap };
}

export function unmaskPII(text: string, maskMap: Map<string, string>): string {
  let result = text;
  for (const [token, original] of maskMap) {
    result = result.replaceAll(token, original);
  }
  return result;
}

// --- Rate limiter (per-tenant sliding window) ---

const rateLimitWindow = 60 * 60 * 1000; // 1 hour
const tenantRequests = new Map<string, number[]>();

export function checkRateLimit(tenantId: string, limit?: number): boolean {
  const maxRequests = limit ?? AI_RATE_LIMIT_PER_TENANT;
  const now = Date.now();
  const cutoff = now - rateLimitWindow;
  const times = (tenantRequests.get(tenantId) ?? []).filter((t) => t > cutoff);
  if (times.length >= maxRequests) {
    tenantRequests.set(tenantId, times);
    return false;
  }
  times.push(now);
  tenantRequests.set(tenantId, times);
  return true;
}

// --- Tenant LLM config resolution ---

// Cache for tenant LLM config (avoids DB query on every call).
// TTL: 5 minutes.
const configCache = new Map<string, { config: LLMConfig | null; expires: number }>();
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

// Get the LLM config for a tenant.
// SaaS-managed: uses global env vars only (no per-tenant integration).
// Returns null if no config is available.
export async function getTenantLLMConfig(tenantId: string): Promise<LLMConfig | null> {
  // Check cache.
  const cached = configCache.get(tenantId);
  if (cached && cached.expires > Date.now()) {
    return cached.config;
  }

  // Use global env vars (SaaS-managed).
  const config = AI_API_KEY ? {
    apiKey: AI_API_KEY,
    baseUrl: AI_BASE_URL,
    model: AI_MODEL,
  } : null;

  // Cache the result.
  configCache.set(tenantId, { config, expires: Date.now() + CONFIG_CACHE_TTL });
  return config;
}

// Clear the config cache for a tenant (call when integration is updated).
export function clearLLMConfigCache(tenantId: string): void {
  configCache.delete(tenantId);
}

// --- LLM call (shared by all modules) ---

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig,
): Promise<{ reply: string; tokens: number }> {
  if (!config.apiKey) {
    return { reply: "IA nao configurada. Configure a integracao LLM ou defina AI_API_KEY no ambiente.", tokens: 0 };
  }

  try {
    const resp = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { reply: `Erro da API de IA (${resp.status}): ${body.slice(0, 200)}`, tokens: 0 };
    }

    const data = (await resp.json()) as {
      choices?: { message: { content: string } }[];
      usage?: { total_tokens: number };
    };
    if (!data.choices?.length) {
      return { reply: "IA nao retornou resposta.", tokens: 0 };
    }
    return {
      reply: data.choices[0]!.message.content,
      tokens: data.usage?.total_tokens ?? 0,
    };
  } catch (err) {
    return { reply: `Erro de conexao com IA: ${(err as Error).message}`, tokens: 0 };
  }
}

// --- LLM streaming call (SSE) ---
// Returns a ReadableStream that yields text chunks as they arrive.
// The caller is responsible for inserting the user message and saving the final reply.

export async function callLLMStream(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig,
): Promise<{ stream: ReadableStream<Uint8Array>; getFullReply: () => string; getTokens: () => number }> {
  const encoder = new TextEncoder();
  let fullReply = "";
  let tokens = 0;

  if (!config.apiKey) {
    const errorMsg = "IA nao configurada. Configure a integracao LLM ou defina AI_API_KEY no ambiente.";
    fullReply = errorMsg;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: errorMsg })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return { stream, getFullReply: () => fullReply, getTokens: () => 0 };
  }

  const resp = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    const errorMsg = `Erro da API de IA (${resp.status}): ${errBody.slice(0, 200)}`;
    fullReply = errorMsg;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: errorMsg })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return { stream, getFullReply: () => fullReply, getTokens: () => 0 };
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: { delta?: { content?: string } }[];
                usage?: { total_tokens?: number };
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullReply += content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
              }
              if (parsed.usage?.total_tokens) {
                tokens = parsed.usage.total_tokens;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err) {
        const errorMsg = `Erro de stream: ${(err as Error).message}`;
        fullReply += errorMsg;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: errorMsg })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return { stream, getFullReply: () => fullReply, getTokens: () => tokens };
}

// --- Case summary ---

export async function generateCaseSummary(
  tenantId: string,
  caseData: {
    title: string;
    case_number?: string;
    case_type: string;
    tribunal?: string;
    status: string;
    description?: string;
  },
  events: { event_type: string; description: string; created_at: string }[],
  clientPII: ClientPII,
): Promise<string> {
  if (!checkRateLimit(tenantId)) {
    throw new Error("Limite de requisicoes IA excedido, tente novamente mais tarde.");
  }

  const config = await getTenantLLMConfig(tenantId);
  if (!config) {
    throw new Error("IA nao configurada. Configure a integracao LLM em Integracoes ou defina AI_API_KEY no ambiente.");
  }

  // Build prompt with PII tokens directly (never put raw PII in the prompt string).
  // This prevents accidental PII leakage via logging or error handling.
  const maskMap = new Map<string, string>();
  if (clientPII.name) maskMap.set("[NOME_CLIENTE]", clientPII.name);
  if (clientPII.cpf) maskMap.set("[CPF_CLIENTE]", clientPII.cpf);
  if (clientPII.cnpj) maskMap.set("[CNPJ_CLIENTE]", clientPII.cnpj);
  if (clientPII.email) maskMap.set("[EMAIL_CLIENTE]", clientPII.email);
  if (clientPII.phone) maskMap.set("[TELEFONE_CLIENTE]", clientPII.phone);
  if (clientPII.address) maskMap.set("[ENDERECO_CLIENTE]", clientPII.address);

  let prompt = `Dados do processo:\nTitulo: ${caseData.title}\n`;
  if (caseData.case_number) prompt += `Numero: ${caseData.case_number}\n`;
  prompt += `Tipo: ${caseData.case_type}\n`;
  if (caseData.tribunal) prompt += `Tribunal: ${caseData.tribunal}\n`;
  prompt += `Status: ${caseData.status}\n`;
  if (caseData.description) prompt += `Descricao: ${caseData.description}\n`;

  // Use tokens instead of raw PII.
  prompt += `\nDados do cliente:\nNome: [NOME_CLIENTE]\n`;
  if (clientPII.cpf) prompt += `CPF: [CPF_CLIENTE]\n`;
  if (clientPII.cnpj) prompt += `CNPJ: [CNPJ_CLIENTE]\n`;

  prompt += `\nEventos do processo:\n`;
  for (const e of events) {
    const date = new Date(e.created_at).toLocaleDateString("pt-BR");
    // Mask any PII that might appear in event descriptions.
    let eventDesc = e.description;
    for (const [token, original] of maskMap) {
      eventDesc = eventDesc.replaceAll(original, token);
    }
    prompt += `- [${date}] ${e.event_type}: ${eventDesc}\n`;
  }

  prompt += `\nGere um resumo conciso do processo baseado nas informacoes acima.`;

  // The prompt is already masked — no need to call maskPII again.
  const maskedText = prompt;

  const systemPrompt =
    "Voce e um assistente juridico. Gere um resumo conciso e profissional do processo baseado nos eventos fornecidos. Use linguagem formal juridica em portugues.";

  const { reply } = await callLLM(systemPrompt, maskedText, config);
  return unmaskPII(reply, maskMap);
}

// --- Movement translation/explanation ---

export async function translateMovement(
  tenantId: string,
  movementText: string,
  caseContext?: string,
): Promise<string> {
  if (!checkRateLimit(tenantId)) {
    throw new Error("Limite de requisicoes IA excedido, tente novamente mais tarde.");
  }

  const config = await getTenantLLMConfig(tenantId);
  if (!config) {
    throw new Error("IA nao configurada. Configure a integracao LLM em Integracoes ou defina AI_API_KEY no ambiente.");
  }

  let prompt = `Movimento processual:\n${movementText}\n`;
  if (caseContext) {
    prompt += `\nContexto do processo:\n${caseContext}\n`;
  }
  prompt += `\nTraduza e explique este movimento processual em linguagem clara para o advogado e o cliente. Indique o que significa e quais os proximos passos provaveis.`;

  const systemPrompt =
    "Voce e um assistente juridico especializado em processo judicial brasileiro. Traduza movimentos processuais do juridico para o portugues claro, explicando o significado e os impactos praticos.";

  const { reply } = await callLLM(systemPrompt, prompt, config);
  return reply;
}

// --- Next steps suggestion ---

export async function suggestNextSteps(
  tenantId: string,
  caseData: { title: string; case_type: string; status: string; description?: string },
  events: { event_type: string; description: string; created_at: string }[],
): Promise<string> {
  if (!checkRateLimit(tenantId)) {
    throw new Error("Limite de requisicoes IA excedido, tente novamente mais tarde.");
  }

  const config = await getTenantLLMConfig(tenantId);
  if (!config) {
    throw new Error("IA nao configurada. Configure a integracao LLM em Integracoes ou defina AI_API_KEY no ambiente.");
  }

  let prompt = `Dados do processo:\nTitulo: ${caseData.title}\nTipo: ${caseData.case_type}\nStatus: ${caseData.status}\n`;
  if (caseData.description) prompt += `Descricao: ${caseData.description}\n`;

  prompt += `\nEventos recentes:\n`;
  for (const e of events) {
    const date = new Date(e.created_at).toLocaleDateString("pt-BR");
    prompt += `- [${date}] ${e.event_type}: ${e.description}\n`;
  }

  prompt += `\nSugira os proximos passos para o advogado, priorizando por urgencia.`;

  const systemPrompt =
    "Voce e um assistente juridico. Sugira proximos passos acionaveis para o advogado responsavel, em lista numerada, priorizando por urgencia. Linguagem formal em portugues.";

  const { reply } = await callLLM(systemPrompt, prompt, config);
  return reply;
}
