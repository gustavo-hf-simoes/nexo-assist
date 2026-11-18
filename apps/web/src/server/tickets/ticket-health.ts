export type TicketsHealth = { status: "online" | "degraded" };

const TIMEOUT_MS = 2000;

// Pinga o /health do serviço de chamados (fora de auth e de injeção de falha).
export async function checkTicketsHealth(
  fetchImpl: typeof fetch,
  baseUrl: string,
): Promise<TicketsHealth> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: response.ok ? "online" : "degraded" };
  } catch {
    return { status: "degraded" };
  }
}
