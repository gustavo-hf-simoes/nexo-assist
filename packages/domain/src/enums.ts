export const TICKET_TYPES = ["INC", "REQ"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_CATEGORIES = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const PRIORITIES = ["critica", "alta", "media", "baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const TICKET_STATUSES = [
  "aberto",
  "em_andamento",
  "aguardando_analista",
  "aprovado",
  "resolvido",
  "encerrado",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function isOpenStatus(status: TicketStatus): boolean {
  return status !== "resolvido" && status !== "encerrado";
}

export const IMPACTS = ["individual", "team", "company"] as const;
export type Impact = (typeof IMPACTS)[number];

export const CONVERSATION_STATES = ["agent", "waiting_analyst", "analyst", "closed"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];
