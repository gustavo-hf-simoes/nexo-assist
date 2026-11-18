import type { Impact, Priority, TicketCategory, TicketType } from "@nexo/domain";

export type DraftKind = "create" | "update" | "reopen";
export type DraftStatus = "pending" | "confirming" | "confirmed" | "cancelled" | "superseded" | "failed";

// Guardado em ticket_drafts.payload. A prioridade e o prazo já vêm calculados pelo servidor.
export interface DraftPayload {
  title: string;
  description: string;
  type: TicketType;
  category: TicketCategory;
  impact: Impact;
  blocksWork: boolean;
  sameDayDeadline: boolean;
  affectedLabel: string;
  priority: Priority;
  priorityReason: string;
  dueAt: string;
}

export interface NewDraftInput {
  conversationId: string;
  employeeId: string;
  kind: DraftKind;
  targetTicketCode?: string;
  payload: DraftPayload;
}

export interface DraftView {
  id: string;
  displayCode: string;
  kind: DraftKind;
  targetCode?: string;
  title: string;
  description: string;
  type: TicketType;
  category: TicketCategory;
  priority: Priority;
  priorityReason: string;
  dueAt: string;
  affectedLabel: string;
  status: DraftStatus;
}

export interface DraftRowLike {
  id: string;
  displayCode: string;
  kind: DraftKind;
  targetTicketCode: string | null;
  payload: DraftPayload;
  status: DraftStatus;
}

export function toDraftView(row: DraftRowLike): DraftView {
  const { payload } = row;
  return {
    id: row.id,
    displayCode: row.displayCode,
    kind: row.kind,
    ...(row.targetTicketCode === null ? {} : { targetCode: row.targetTicketCode }),
    title: payload.title,
    description: payload.description,
    type: payload.type,
    category: payload.category,
    priority: payload.priority,
    priorityReason: payload.priorityReason,
    dueAt: payload.dueAt,
    affectedLabel: payload.affectedLabel,
    status: row.status,
  };
}
