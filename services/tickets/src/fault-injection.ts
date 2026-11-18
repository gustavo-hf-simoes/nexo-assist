import type { MiddlewareHandler } from "hono";
import { setTimeout as sleep } from "node:timers/promises";
import { errorBody } from "./http-errors";

export interface FaultInjectorOptions {
  failureRate: number;
  latencyMs?: number;
  random?: () => number;
}

// Simula um serviço instável: atraso opcional e 503 com probabilidade `failureRate`.
export function createFaultInjector(options: FaultInjectorOptions): MiddlewareHandler {
  const { failureRate, latencyMs = 0, random = Math.random } = options;
  return async (c, next) => {
    if (latencyMs > 0) await sleep(latencyMs);
    if (failureRate > 0 && random() < failureRate) {
      return c.json(errorBody("service_unavailable", "Serviço temporariamente indisponível."), 503);
    }
    await next();
    return undefined;
  };
}
