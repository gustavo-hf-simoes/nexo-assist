import type { TicketDto } from "@nexo/domain";
import type { ConversationService } from "../conversations/conversation-service";
import type { HandoffReason } from "../conversations/conversation-state";
import { TicketServiceUnavailableError } from "../tickets/ticket-errors";
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
      await deps.gateway.transfer(employeeId, ticket.code, {
        queue: "N2",
        summary: `Chamado crítico ${ticket.code}: ${ticket.title}`,
      });
    } catch (error) {
      logFailure("falha ao enfileirar o chamado crítico no N2", error);
    }
  }
  return result;
}

// Mapeia os erros dos rascunhos para respostas HTTP em pt-BR; undefined se o erro não for conhecido.
export function draftErrorResponse(error: unknown): Response | undefined {
  if (error instanceof DraftNotPendingError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof DraftNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof TicketServiceUnavailableError) {
    return Response.json(
      { error: "O serviço de chamados está indisponível no momento. Tente confirmar novamente em instantes." },
      { status: 503 },
    );
  }
  return undefined;
}
