import type { CreateTicketInput, TicketDto } from "@nexo/domain";
import type { ConversationEvent, HandoffReason } from "../conversations/conversation-state";
import { InvalidTransitionError } from "../conversations/errors";
import type { Database } from "../db/client";
import { TicketServiceUnavailableError } from "../tickets/ticket-errors";
import type { TicketGateway } from "../tickets/ticket-gateway";
import { DraftRepository, type DraftRow } from "./draft-repository";
import { toDraftView, type DraftView, type NewDraftInput } from "./draft-types";
import { DraftNotFoundError, DraftNotPendingError } from "./errors";

export type { DraftView, NewDraftInput } from "./draft-types";

export interface DraftConversations {
  apply(conversationId: string, event: ConversationEvent): Promise<unknown>;
}

export class DraftService {
  private readonly repo: DraftRepository;

  constructor(
    db: Database,
    private readonly gateway: TicketGateway,
    private readonly conversations: DraftConversations,
  ) {
    this.repo = new DraftRepository(db);
  }

  async createDraft(input: NewDraftInput): Promise<DraftView> {
    return toDraftView(await this.repo.insertSupersedingPending(input));
  }

  async listForConversation(conversationId: string, employeeId: string): Promise<DraftView[]> {
    return (await this.repo.listByConversation(conversationId, employeeId)).map(toDraftView);
  }

  // Dados mínimos de um rascunho do funcionário; de outro funcionário ou inexistente é "não encontrado".
  async getOwned(draftId: string, employeeId: string): Promise<{ conversationId: string; kind: DraftRow["kind"] }> {
    const row = await this.repo.findById(draftId);
    if (!row || row.employeeId !== employeeId) throw new DraftNotFoundError();
    return { conversationId: row.conversationId, kind: row.kind };
  }

  async confirm(draftId: string, employeeId: string): Promise<{ ticket: TicketDto; handoff?: HandoffReason }> {
    const draft = await this.repo.transitionFromPending(draftId, employeeId, "confirming");
    if (!draft) throw await this.whyNotPending(draftId, employeeId);

    let ticket: TicketDto;
    try {
      ticket = await this.send(draft, employeeId);
    } catch (error) {
      // Indisponibilidade é transitória: volta a pending e o confirm seguinte reusa a mesma chave.
      const to = error instanceof TicketServiceUnavailableError ? "pending" : "failed";
      await this.repo.finishConfirming(draft.id, to);
      throw error;
    }
    await this.repo.finishConfirming(draft.id, "confirmed", ticket.code);

    if (draft.kind === "create" && ticket.priority === "critica") {
      const handoff = await this.handOffCritical(draft, ticket);
      if (handoff) return { ticket, handoff };
    }
    return { ticket };
  }

  async cancel(draftId: string, employeeId: string): Promise<void> {
    const cancelled = await this.repo.transitionFromPending(draftId, employeeId, "cancelled");
    if (!cancelled) throw await this.whyNotPending(draftId, employeeId);
  }

  private send(draft: DraftRow, employeeId: string): Promise<TicketDto> {
    const { payload } = draft;
    switch (draft.kind) {
      case "create": {
        const input: CreateTicketInput = {
          title: payload.title,
          description: payload.description,
          type: payload.type,
          category: payload.category,
          affected: payload.impact,
          blocksWork: payload.blocksWork,
          sameDayDeadline: payload.sameDayDeadline,
        };
        return this.gateway.create(employeeId, input, draft.id);
      }
      case "update":
        return this.gateway.addComment(employeeId, this.target(draft), payload.description, draft.id);
      case "reopen":
        return this.gateway.reopen(employeeId, this.target(draft));
    }
  }

  private target(draft: DraftRow): string {
    if (!draft.targetTicketCode) throw new Error("Rascunho sem chamado alvo.");
    return draft.targetTicketCode;
  }

  // Chamado crítico segue para o analista; se a conversa já não está com o agent, não há o que transferir.
  private async handOffCritical(draft: DraftRow, ticket: TicketDto): Promise<HandoffReason | undefined> {
    try {
      await this.conversations.apply(draft.conversationId, {
        type: "handoff",
        reason: "critical",
        summary: `Chamado crítico ${ticket.code}: ${ticket.title}`,
      });
      return "critical";
    } catch (error) {
      if (error instanceof InvalidTransitionError) return undefined;
      throw error;
    }
  }

  private async whyNotPending(draftId: string, employeeId: string): Promise<Error> {
    const row = await this.repo.findById(draftId);
    return row && row.employeeId === employeeId ? new DraftNotPendingError() : new DraftNotFoundError();
  }
}
