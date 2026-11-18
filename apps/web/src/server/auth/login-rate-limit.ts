export type LoginRateLimiter = {
  isBlocked(key: string): boolean;
  recordFailure(key: string): void;
};

type Options = { maxFailures: number; windowMs: number; now?: () => number };

// Trade-off assumido: o contador é em memória, por processo e por IP. Reinicia com o servidor,
// não é compartilhado entre instâncias e o IP vem de X-Forwarded-For (falsificável sem proxy
// confiável). Basta para conter tentativa em massa nesta demonstração; em produção com várias
// instâncias o contador iria para um armazenamento compartilhado (Redis ou o Postgres).
export function createLoginRateLimiter({
  maxFailures,
  windowMs,
  now = Date.now,
}: Options): LoginRateLimiter {
  const failures = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const cutoff = now() - windowMs;
    const kept = (failures.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length > 0) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  return {
    isBlocked: (key) => recent(key).length >= maxFailures,
    recordFailure: (key) => {
      failures.set(key, [...recent(key), now()]);
    },
  };
}

// Até 5 falhas por minuto e IP; a 6ª tentativa já recebe 429.
export const loginRateLimiter = createLoginRateLimiter({ maxFailures: 5, windowMs: 60_000 });
