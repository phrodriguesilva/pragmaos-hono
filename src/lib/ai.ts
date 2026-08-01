// AI services for PragmaOS MVP.
// - PII masking before sending to LLM (LGPD compliance).
// - Case summary generation.
// - Movement translation/explanation.
// Uses an OpenAI-compatible API.

import { AI_API_KEY, AI_BASE_URL, AI_MODEL, AI_RATE_LIMIT_PER_TENANT } from "./env";

// --- PII Masking ---

type ClientPII = {
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

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const cutoff = now - rateLimitWindow;
  const times = (tenantRequests.get(tenantId) ?? []).filter((t) => t > cutoff);
  if (times.length >= AI_RATE_LIMIT_PER_TENANT) {
    tenantRequests.set(tenantId, times);
    return false;
  }
  times.push(now);
  tenantRequests.set(tenantId, times);
  return true;
}

// --- LLM call ---

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!AI_API_KEY) {
    throw new Error("IA nao configurada (AI_API_KEY ausente).");
  }

  const resp = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`LLM API retornou ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as {
    choices: { message: { content: string } }[];
  };
  if (!data.choices?.length) {
    throw new Error("LLM API nao retornou choices.");
  }
  return data.choices[0]!.message.content;
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

  let prompt = `Dados do processo:\nTitulo: ${caseData.title}\n`;
  if (caseData.case_number) prompt += `Numero: ${caseData.case_number}\n`;
  prompt += `Tipo: ${caseData.case_type}\n`;
  if (caseData.tribunal) prompt += `Tribunal: ${caseData.tribunal}\n`;
  prompt += `Status: ${caseData.status}\n`;
  if (caseData.description) prompt += `Descricao: ${caseData.description}\n`;

  prompt += `\nDados do cliente:\nNome: ${clientPII.name}\n`;
  if (clientPII.cpf) prompt += `CPF: ${clientPII.cpf}\n`;
  if (clientPII.cnpj) prompt += `CNPJ: ${clientPII.cnpj}\n`;

  prompt += `\nEventos do processo:\n`;
  for (const e of events) {
    const date = new Date(e.created_at).toLocaleDateString("pt-BR");
    prompt += `- [${date}] ${e.event_type}: ${e.description}\n`;
  }

  prompt += `\nGere um resumo conciso do processo baseado nas informacoes acima.`;

  // Mask PII before sending.
  const { maskedText, maskMap } = maskPII(prompt, clientPII);

  const systemPrompt =
    "Voce e um assistente juridico. Gere um resumo conciso e profissional do processo baseado nos eventos fornecidos. Use linguagem formal juridica em portugues.";

  const summaryMasked = await callLLM(systemPrompt, maskedText);
  return unmaskPII(summaryMasked, maskMap);
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

  let prompt = `Movimento processual:\n${movementText}\n`;
  if (caseContext) {
    prompt += `\nContexto do processo:\n${caseContext}\n`;
  }
  prompt += `\nTraduza e explique este movimento processual em linguagem clara para o advogado e o cliente. Indique o que significa e quais os proximos passos provaveis.`;

  const systemPrompt =
    "Voce e um assistente juridico especializado em processo judicial brasileiro. Traduza movimentos processuais do juridico para o portugues claro, explicando o significado e os impactos praticos.";

  return callLLM(systemPrompt, prompt);
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

  return callLLM(systemPrompt, prompt);
}
