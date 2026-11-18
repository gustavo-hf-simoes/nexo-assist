import type { Impact, Priority, TicketType } from "./enums";

export interface PriorityInput {
  type: TicketType;
  impact: Impact;
  blocksWork: boolean;
  sameDayDeadline: boolean;
}

export function classifyPriority(input: PriorityInput): { priority: Priority; reason: string } {
  if (input.blocksWork && (input.impact === "team" || input.impact === "company")) {
    return {
      priority: "critica",
      reason: "Impede o trabalho e afeta uma equipe ou a empresa inteira.",
    };
  }
  if (input.blocksWork) {
    return { priority: "alta", reason: "Impede o trabalho de quem abriu o chamado." };
  }
  if (input.sameDayDeadline) {
    return { priority: "alta", reason: "Há um compromisso que vence no mesmo dia." };
  }
  if (input.type === "REQ") {
    return { priority: "baixa", reason: "Pedido sem bloqueio e sem prazo no mesmo dia." };
  }
  return { priority: "media", reason: "Problema sem bloqueio e sem prazo no mesmo dia." };
}
