import { z } from "zod";
import { toHttpError } from "../errors";
import { requireAnalyst } from "../auth/guards";
import type { SessionClaims } from "../auth/session";
import { ConversationService } from "./conversation-service";
import type { ConversationRow } from "./conversation-repository";
import { ConversationNotFoundError, InvalidTransitionError, NotAssignedError } from "./errors";
import type { ConversationEvent } from "./conversation-state";
import { getDb } from "../db/app-db";

export type ConsoleRouteContext = { params: Promise<{ id: string }> };

const IdSchema = z.string().uuid();

// Mapa de erros do console: transição inválida/estado mudou = 409; outro responsável = 403; inexistente = 404.
export function consoleErrorResponse(error: unknown): Response {
  if (error instanceof ConversationNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof InvalidTransitionError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof NotAssignedError) return Response.json({ error: error.message }, { status: 403 });
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

// Regra de posse (conferida dentro da transação da transição, com a linha travada):
// - `analyst`: só o responsável devolve ou encerra (outro analista recebe 403);
// - `waiting_analyst`: ninguém é dono ainda, qualquer analista pode devolver, encerrar ou assumir;
// - `agent`: o console pode encerrar (devolver não faz sentido e dá 409 pela máquina de estados);
// - `closed`: 409 pela máquina de estados.
// Assumir em `analyst` também é 409 (a transição não existe), inclusive para o segundo analista.
export function ownerRule(analystId: string, event: ConversationEvent): (current: ConversationRow) => void {
  return (current) => {
    if (event.type === "assume") return;
    if (current.state === "analyst" && current.assignedAnalystId !== analystId) throw new NotAssignedError();
  };
}

export async function runConsoleEvent(
  conversationId: string,
  analystId: string,
  build: (analystId: string) => ConversationEvent,
  db = getDb(),
): Promise<Response> {
  const event = build(analystId);
  const updated = await new ConversationService(db).apply(conversationId, event, ownerRule(analystId, event));
  return Response.json({ state: updated.state, assignedAnalystId: updated.assignedAnalystId });
}
