import { Hono, type MiddlewareHandler } from "hono";
import { bearerAuth } from "./auth";
import { errorBody, handleError } from "./http-errors";
import { createRoutes } from "./routes";
import type { TicketRepository } from "./ticket-repository";

export interface AppDeps {
  repository: TicketRepository;
  token: string;
  faultInjector: MiddlewareHandler;
  now?: () => Date;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  // Fora da autenticação e da falha injetada: serve de sonda de saúde.
  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("*", bearerAuth(deps.token));
  app.use("*", deps.faultInjector);
  app.route(
    "/",
    createRoutes({ repository: deps.repository, now: deps.now ?? (() => new Date()) }),
  );

  app.notFound((c) => c.json(errorBody("not_found", "Recurso não encontrado."), 404));
  app.onError(handleError);
  return app;
}
