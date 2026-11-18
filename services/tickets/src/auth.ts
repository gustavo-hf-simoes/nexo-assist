import { createHash, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { errorBody } from "./http-errors";

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

// Os dois lados viram digests de tamanho fixo, então a comparação em tempo constante
// nunca lança por diferença de tamanho nem revela o tamanho do token.
export function tokensMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!tokensMatch(provided, token)) {
      return c.json(
        errorBody("unauthorized", "Credenciais do serviço ausentes ou inválidas."),
        401,
      );
    }
    await next();
    return undefined;
  };
}
