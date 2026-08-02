// Intimações eletrônicas — integração com PJe/DJE/Domicílio Eletrônico.
// Suporta intima.ai API (serviço de captura automática de intimações).
// PragmaOS 2.

import { supabase } from "./supabase";

export interface Intimacao {
  id: string;
  tribunal: string;
  processo: string;
  dataDisponibilizacao: string;
  dataIntimacao: string;
  tipo: string;
  conteudo: string;
  link: string;
  lida: boolean;
}

// Busca intimações via intima.ai API
// Requer configuração prévia da API key em Integrations
export async function fetchIntimacoes(
  tenantId: string,
  opts?: { dataInicio?: string; dataFim?: string }
): Promise<{ success: boolean; intimacoes?: Intimacao[]; error?: string }> {
  // Buscar configuração da integração intima.ai
  const { data: integration } = await supabase
    .from("integrations")
    .select("config, access_token")
    .eq("tenant_id", tenantId)
    .eq("type", "intima_ai")
    .eq("active", true)
    .maybeSingle();

  if (!integration) {
    return { success: false, error: "Integracao intima.ai nao configurada. Configure em Integracoes." };
  }

  const apiKey = (integration.access_token as string) ??
    ((integration.config as Record<string, unknown>)?.api_key as string) ?? "";

  if (!apiKey) {
    return { success: false, error: "API key do intima.ai nao configurada." };
  }

  try {
    const params = new URLSearchParams();
    params.append("api_token", apiKey);
    if (opts?.dataInicio) params.append("data_inicio", opts.dataInicio);
    if (opts?.dataFim) params.append("data_fim", opts.dataFim);

    const response = await fetch(`https://app.intima.ai/api/v2/intimacoes?${params.toString()}`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Erro na API intima.ai: ${response.status}` };
    }

    const data = await response.json() as { data?: Intimacao[] };
    return { success: true, intimacoes: data.data ?? [] };
  } catch (err) {
    return { success: false, error: `Erro ao buscar intimações: ${err}` };
  }
}

// Marca intimação como lida no intima.ai
export async function marcarIntimacaoLida(
  tenantId: string,
  intimaId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: integration } = await supabase
    .from("integrations")
    .select("config, access_token")
    .eq("tenant_id", tenantId)
    .eq("type", "intima_ai")
    .eq("active", true)
    .maybeSingle();

  if (!integration) {
    return { success: false, error: "Integracao nao configurada" };
  }

  const apiKey = (integration.access_token as string) ?? "";

  try {
    const response = await fetch(`https://app.intima.ai/api/v2/intimacoes/${intimaId}/ciencia?api_token=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Erro ao dar ciencia: ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: `Erro: ${err}` };
  }
}
