/**
 * fetchWithTimeout — wrapper around fetch that aborts after a timeout.
 * Prevents hanging indefinitely when external APIs are unresponsive.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Requisicao expirou apos ${timeoutMs / 1000}s (${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * friendlyApiError — maps HTTP status codes to user-friendly Portuguese messages.
 * Falls back to a generic message with the provider name.
 */
export function friendlyApiError(provider: string, status: number, _body: string): string {
  const messages: Record<number, string> = {
    400: `Requisicao invalida para ${provider}. Verifique os dados enviados.`,
    401: `Credenciais invalidas para ${provider}. Verifique a chave de API.`,
    403: `Acesso negado para ${provider}. Verifique as permissoes da integracao.`,
    404: `Recurso nao encontrado em ${provider}.`,
    422: `Dados invalidos para ${provider}. Verifique os campos obrigatórios.`,
    429: `Limite de requisicoes excedido para ${provider}. Tente novamente em alguns minutos.`,
    500: `Erro interno no servidor de ${provider}. Tente novamente.`,
    502: `Servidor de ${provider} indisponivel. Tente novamente.`,
    503: `Servico de ${provider} temporariamente indisponivel. Tente novamente.`,
    504: `Timeout no servidor de ${provider}. Tente novamente.`,
  };
  return messages[status] ?? `Erro ${status} ao conectar com ${provider}.`;
}

