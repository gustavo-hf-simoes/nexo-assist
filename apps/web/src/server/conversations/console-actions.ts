import { z } from "zod";
import { toHttpError } from "../errors";
import { requireAnalyst } from "../auth/guards";
import type { SessionClaims } from "../auth/session";
import { ConversationService } from "./conversation-service";
import { ConversationNotFoundError, InvalidTransitionError, NotAssignedError } from "./errors";
import type { ConversationEvent } from "./conversation-state";
import { getDb } from "../db/app-db";

export type ConsoleRouteContext = { params: Promise<{ id: string }> };

const IdSchema = z.string().uuid();

// Mapa de erros do console: transição inválida/estado mudou = 409; outro responsável = 403; inexistente = 404.
export function consoleErrorResponse(error: unknown): Response {
  if (error instanceof InvalidTransitionError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof NotAssignedError) return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof ConversationNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  console.error("[api/console]", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json({ error: "Erro interno." }, { status: 500 });
}

// Autentica o analista (401/403), valida o id (404) e converte as falhas do handler em resposta HTTP.
export async function handleConsoleRoute(
  req: Request,
  ctx: ConsoleRouteContext,
  handler: (claims: SessionClaims, conversationId: string) => Promise<Response>,
): Promise<Response> {
  let claims: SessionClaims;
  try {
    claims = await requireAnalyst(req);
  } catch (error) {
    return toHttpError(error);
  }
  const id = IdSchema.safeParse((await ctx.params).id);
  if (!id.success) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
  try {
    return await handler(claims, id.data);
  } catch (error) {
    return consoleErrorResponse(error);
  }
}

// Assumir, devolver ao agent e encerrar. Em conversa que outro analista já assumiu, só o responsável age (403);
// a transição em si é protegida por UPDATE condicional (409 se o estado mudou no meio).
export async function runConsoleEvent(
  conversationId: string,
  analystId: string,
  build: (analystId: string) => ConversationEvent,
  db = getDb(),
): Promise<Response> {
  const service = new ConversationService(db);
  const current = await service.findById(conversationId);
  if (!current) throw new ConversationNotFoundError();
  const event = build(analystId);
  if (event.type !== "assume" && current.state === "analyst" && current.assignedAnalystId !== analystId) {
    throw new NotAssignedError();
  }
  const updated = await service.apply(conversationId, event);
  return Response.json({ state: updated.state, assignedAnalystId: updated.assignedAnalystId });
}
