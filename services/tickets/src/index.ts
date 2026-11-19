import { serve } from "@hono/node-server";
import { createServerApp } from "./server-app";

const { app, pool, env } = createServerApp();

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
