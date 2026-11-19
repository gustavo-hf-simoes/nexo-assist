// O plano gratuito da Groq limita tokens por minuto; cenários seguidos estouram o limite.
// Um 429 no eval é falta de cota momentânea, não erro do agent: espera a janela e tenta de novo.

export interface RetryOptions {
  attempts: number;
  waitMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const RATE_LIMIT_MESSAGE = /rate limit|too many requests|tokens per minute/i;
// Limite diário só volta no dia seguinte: esperar um minuto não adianta.
const DAILY_LIMIT_MESSAGE = /per day|\(TPD\)|\(RPD\)/i;

// Só limites por minuto: vale esperar a janela e tentar de novo.
export function isRateLimited(error: unknown): boolean {
  if (!(error instanceof Error) || DAILY_LIMIT_MESSAGE.test(error.message)) return false;
  const status = (error as { statusCode?: unknown }).statusCode;
  return status === 429 || RATE_LIMIT_MESSAGE.test(error.message);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function retryOnRateLimit<T>(run: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= options.attempts || !isRateLimited(error)) throw error;
      await sleep(options.waitMs);
    }
  }
}
