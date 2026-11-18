import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { createDb } from "./db/client";
import { createFaultInjector } from "./fault-injection";
import { DrizzleTicketRepository } from "./ticket-repository";

const env = loadEnv();
const { db, pool } = createDb(env.TICKETS_DATABASE_URL);

const app = createApp({
  repository: new DrizzleTicketRepository(db),
  token: env.TICKET_SERVICE_TOKEN,
  faultInjector: createFaultInjector({
    failureRate: env.TICKET_SERVICE_FAILURE_RATE,
    latencyMs: env.TICKET_SERVICE_LATENCY_MS,
  }),
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Serviço de chamados ouvindo na porta ${info.port}.`);
});

function shutdown(): void {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
