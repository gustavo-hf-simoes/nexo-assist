import { TZDate } from "@date-fns/tz";
import type { TicketDto } from "./contracts";
import { isOpenStatus, type Priority } from "./enums";

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 18;
const MINUTE_MS = 60_000;

const SLA_LABEL: Record<Priority, string> = {
  critica: "1 hora",
  alta: "4 horas úteis",
  media: "3 dias úteis",
  baixa: "5 dias úteis",
};

export function slaLabel(priority: Priority): string {
  return SLA_LABEL[priority];
}

function isWeekend(d: TZDate): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function atHour(d: TZDate, hour: number, dayOffset = 0): TZDate {
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, 0, 0, 0, BUSINESS_TIME_ZONE);
}

/** Primeiro instante útil igual ou posterior a `d` (seg-sex, 08:00-18:00). */
function nextBusinessInstant(d: TZDate): TZDate {
  let cursor = d;
  if (!isWeekend(cursor)) {
    if (cursor.getHours() < BUSINESS_START_HOUR) return atHour(cursor, BUSINESS_START_HOUR);
    if (cursor.getHours() < BUSINESS_END_HOUR) return cursor;
  }
  cursor = atHour(cursor, BUSINESS_START_HOUR, 1);
  while (isWeekend(cursor)) cursor = atHour(cursor, BUSINESS_START_HOUR, 1);
  return cursor;
}

function addBusinessHours(from: Date, hours: number): Date {
  let cursor = nextBusinessInstant(new TZDate(from.getTime(), BUSINESS_TIME_ZONE));
  let remaining = hours * 60;
  for (;;) {
    const available = Math.round((atHour(cursor, BUSINESS_END_HOUR).getTime() - cursor.getTime()) / MINUTE_MS);
    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * MINUTE_MS);
    }
    remaining -= available;
    cursor = nextBusinessInstant(atHour(cursor, BUSINESS_END_HOUR));
  }
}

function addBusinessDays(from: Date, days: number): Date {
  let cursor = nextBusinessInstant(new TZDate(from.getTime(), BUSINESS_TIME_ZONE));
  let remaining = days;
  while (remaining > 0) {
    cursor = new TZDate(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
      cursor.getHours(),
      cursor.getMinutes(),
      cursor.getSeconds(),
      cursor.getMilliseconds(),
      BUSINESS_TIME_ZONE,
    );
    if (!isWeekend(cursor)) remaining -= 1;
  }
  return new Date(cursor.getTime());
}

/** Feriados não são considerados (trade-off documentado no README). */
export function computeDueAt(priority: Priority, from: Date): Date {
  switch (priority) {
    case "critica":
      return new Date(from.getTime() + 60 * MINUTE_MS);
    case "alta":
      return addBusinessHours(from, 4);
    case "media":
      return addBusinessDays(from, 3);
    case "baixa":
      return addBusinessDays(from, 5);
  }
}

/** O prazo conta a partir da última atualização do suporte; sem ela, da abertura. */
export function slaBaseOf(t: Pick<TicketDto, "createdAt" | "lastSupportUpdateAt">): Date {
  return new Date(t.lastSupportUpdateAt ?? t.createdAt);
}

export function isOverdue(t: TicketDto, now: Date): boolean {
  if (!isOpenStatus(t.status)) return false;
  return computeDueAt(t.priority, slaBaseOf(t)).getTime() < now.getTime();
}
