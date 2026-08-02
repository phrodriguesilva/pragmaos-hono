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
