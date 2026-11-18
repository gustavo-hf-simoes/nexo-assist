import type { TicketDto } from "./contracts";

export const REOPEN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function canReopen(t: TicketDto, now: Date): boolean {
  if (t.status !== "resolvido" || t.resolvedAt === null) return false;
  return now.getTime() - new Date(t.resolvedAt).getTime() <= REOPEN_WINDOW_DAYS * DAY_MS;
}
