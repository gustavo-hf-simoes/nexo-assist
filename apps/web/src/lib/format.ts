const TIME_ZONE = "America/Sao_Paulo";

const timeFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const dayKeyFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const dayMonthFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "numeric", month: "short" });

// "16 out" (sem o "de" que o Intl coloca entre dia e mês).
function dayMonth(date: Date): string {
  const parts = dayMonthFormat.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = (parts.find((p) => p.type === "month")?.value ?? "").replace(".", "");
  return `${day} ${month}`;
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

// "16 out"
export function formatShortDate(iso: string): string {
  return dayMonth(new Date(iso));
}

// "16 out, 14:20"
export function formatDateTime(iso: string): string {
  return `${dayMonth(new Date(iso))}, ${formatTime(iso)}`;
}

// Prazo: só o horário quando é hoje (em America/Sao_Paulo); senão a data e o horário.
export function formatDue(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  return dayKeyFormat.format(due) === dayKeyFormat.format(now) ? formatTime(iso) : formatDateTime(iso);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// Resumo curto e legível de um valor JSON, para o detalhe da decisão.
export function summarizeValue(value: unknown, max = 140): string {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
