import type { ErrorHandler } from "hono";
import {
  IdempotencyKeyConflictError,
  ReopenWindowExpiredError,
  TicketNotFoundError,
  TicketNotResolvedError,
} from "./errors";

export interface ErrorBody {
  error: string;
  message: string;
}

// Requisição malformada (corpo, cabeçalho ou query); a mensagem é segura para devolver.
export class InvalidRequest extends Error {}

export function errorBody(error: string, message: string): ErrorBody {
  return { error, message };
}

// Mensagens genéricas: nunca ecoam dados do chamado nem detalhes internos.
export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof InvalidRequest) {
    return c.json(errorBody("invalid_request", error.message), 400);
  }
  if (error instanceof TicketNotFoundError) {
    return c.json(errorBody("not_found", "Chamado não encontrado."), 404);
  }
  if (error instanceof ReopenWindowExpiredError) {
    return c.json(
      errorBody("reopen_window_expired", "O prazo para reabrir este chamado terminou."),
      409,
    );
  }
  if (error instanceof TicketNotResolvedError) {
    return c.json(errorBody("not_resolved", "O chamado não está resolvido."), 409);
  }
  if (error instanceof IdempotencyKeyConflictError) {
    return c.json(errorBody("idempotency_conflict", "Chave de idempotência já utilizada."), 409);
  }
  console.error("Erro inesperado no serviço de chamados:", error);
  return c.json(errorBody("internal_error", "Erro interno do serviço de chamados."), 500);
};
