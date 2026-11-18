import { computeDueAt, isOverdue, slaBaseOf, type TicketDto } from "@nexo/domain";

export function dueAtOf(ticket: TicketDto): string {
  return computeDueAt(ticket.priority, slaBaseOf(ticket)).toISOString();
}

export function withSla(ticket: TicketDto, now: Date): TicketDto & { dueAt: string; overdue: boolean } {
  return { ...ticket, dueAt: dueAtOf(ticket), overdue: isOverdue(ticket, now) };
}
