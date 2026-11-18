import type { TicketStatus } from "@nexo/domain";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  encerrado: "Encerrado",
};

export type StatusTone = "ok" | "warn" | "danger" | "muted";

export function statusTone(status: TicketStatus): StatusTone {
  if (status === "resolvido" || status === "encerrado") return "ok";
  if (status === "aguardando_analista") return "warn";
  return "muted";
}
