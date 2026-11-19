import type { TicketDto } from "@nexo/domain";
import type { ConversationService } from "../conversations/conversation-service";
import type { HandoffReason } from "../conversations/conversation-state";
import {
  TicketConflictError,
  TicketNotFoundError,
  TicketRequestError,
  TicketServiceUnavailableError,
  type TicketConflictCode,
} from "../tickets/ticket-errors";
import type { TicketGateway } from "../tickets/ticket-gateway";
import type { DraftService } from "./draft-service";
import { DraftNotFoundError, DraftNotPendingError } from "./errors";

export interface DraftActionDeps {
  drafts: Pick<DraftService, "confirm" | "getOwned">;
  conversations: Pick<ConversationService, "appendMessage">;
  gateway: Pick<TicketGateway, "transfer">;
}

const SYSTEM_TEXT = {
  create: (code: string) => `Chamado ${code} criado`,
  update: (code: string) => `Chamado ${code} atualizado`,
  reopen: (code: string) => `Chamado ${code} reaberto`,
} as const;

function logFailure(what: string, error: unknown): void {
  console.error(`[draft] ${what}:`, error instanceof Error ? error.message : "erro desconhecido");
}

// Confirma o rascunho, registra a mensagem de sistema e, se o chamado for crítico, enfileira o N2.
export async function confirmDraft(
  deps: DraftActionDeps,
  draftId: string,
  employeeId: string,
): Promise<{ ticket: TicketDto; handoff?: HandoffReason }> {
  const owned = await deps.drafts.getOwned(draftId, employeeId);
  const result = await deps.drafts.confirm(draftId, employeeId);
  const { ticket, handoff } = result;
  // O chamado já existe: falhas daqui em diante são registradas e não desfazem a confirmação.
  try {
    await deps.conversations.appendMessage(owned.conversationId, {
      author: "system",
      content: SYSTEM_TEXT[owned.kind](ticket.code),
    });
  } catch (error) {
    logFailure("falha ao gravar a mensagem de sistema", error);
  }
  if (handoff === "critical") {
    try {
      await deps.gateway.transfer(
        employeeId,
        ticket.code,
        { queue: "N2", summary: `Chamado crítico ${ticket.code}: ${ticket.title}` },
        `critical:${draftId}`,
      );
    } catch (error) {
      logFailure("falha ao enfileirar o chamado crítico no N2", error);
    }
  }
  return result;
}

const CONFLICT_TEXT: Record<TicketConflictCode, string> = {
  reopen_window_expired: "O prazo de 7 dias para reabrir este chamado terminou. Posso abrir um novo chamado para você.",
  not_resolved: "Este chamado não está resolvido, então não dá para reabri-lo. Posso acrescentar uma atualização a ele.",
  idempotency_conflict: "Esta confirmação conflita com outra já registrada. Peça um novo rascunho e confirme de novo.",
};

// Mapeia os erros dos rascunhos para respostas HTTP em pt-BR; undefined se o erro não for conhecido.
export function draftErrorResponse(error: unknown): Response | undefined {
  if (error instanceof DraftNotPendingError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof DraftNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof TicketConflictError) return Response.json({ error: CONFLICT_TEXT[error.code] }, { status: 409 });
  if (error instanceof TicketNotFoundError) return Response.json({ error: "Chamado não encontrado." }, { status: 404 });
  if (error instanceof TicketRequestError) {
    return Response.json(
      { error: "O serviço de chamados não aceitou esta solicitação. Revise os dados e peça um novo rascunho." },
      { status: 422 },
    );
  }
  if (error instanceof TicketServiceUnavailableError) {
    return Response.json(
      { error: "O serviço de chamados está indisponível no momento. Tente confirmar novamente em instantes." },
      { status: 503 },
    );
  }
  return undefined;
}
