import type { Hono } from "hono";
import type { Pool } from "pg";
import { createApp } from "./app";
import { loadEnv, type TicketsEnv } from "./config/env";
import { createDb } from "./db/client";
import { createFaultInjector } from "./fault-injection";
import { DrizzleTicketRepository } from "./ticket-repository";

// Monta o app real a partir do env; usado pelo servidor Node (src/index.ts) e pela Vercel (server.ts).
export function createServerApp(source: Record<string, string | undefined> = process.env): {
  app: Hono;
  pool: Pool;
  env: TicketsEnv;
} {
  const env = loadEnv(source);
  const { db, pool } = createDb(env.TICKETS_DATABASE_URL, { max: env.DB_POOL_MAX });
  const app = createApp({
    repository: new DrizzleTicketRepository(db),
    token: env.TICKET_SERVICE_TOKEN,
    faultInjector: createFaultInjector({
      failureRate: env.TICKET_SERVICE_FAILURE_RATE,
      latencyMs: env.TICKET_SERVICE_LATENCY_MS,
    }),
  });
  return { app, pool, env };
}
