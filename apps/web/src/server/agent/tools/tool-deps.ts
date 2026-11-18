import type { ConversationEvent } from "../../conversations/conversation-state";
import type { DraftView, NewDraftInput } from "../../drafts/draft-types";
import type { KbSearchResult } from "../../knowledge/knowledge-base";
import type { TicketGateway } from "../../tickets/ticket-gateway";

// Dependências injetadas nas tools; portas estreitas para os testes unitários não precisarem de banco.
export interface ToolDeps {
  gateway: TicketGateway;
  conversations: { apply(conversationId: string, event: ConversationEvent): Promise<unknown> };
  drafts: { createDraft(input: NewDraftInput): Promise<DraftView> };
  searchArticles: (query: string) => Promise<KbSearchResult[]>;
  now?: () => Date;
}

export function nowOf(deps: ToolDeps): Date {
  return deps.now ? deps.now() : new Date();
}

export const TICKETS_UNAVAILABLE = { ok: false, error: "tickets_unavailable" } as const;
