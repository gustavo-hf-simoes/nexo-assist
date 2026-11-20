import type { ConversationState, TransferInput } from "@nexo/domain";
import { InvalidTransitionError } from "./errors";

export type HandoffReason = "user_request" | "critical" | "overdue" | "low_confidence";

export type HandoffQueue = TransferInput["queue"];

// Críticos e atrasados vão para o N2; o resto começa no N1.
export function handoffQueue(reason: HandoffReason): HandoffQueue {
  return reason === "critical" || reason === "overdue" ? "N2" : "N1";
}

export type ConversationEvent =
  | { type: "handoff"; reason: HandoffReason; summary: string }
  | { type: "assume"; analystId: string }
  | { type: "return_to_agent" }
  | { type: "close" };

// Função pura: devolve o próximo estado ou lança se o evento não vale no estado atual.
export function transition(state: ConversationState, event: ConversationEvent): ConversationState {
  switch (event.type) {
    case "handoff":
      if (state === "agent") return "waiting_analyst";
      break;
    case "assume":
      // O analista pode assumir uma conversa transferida ou intervir numa que está com o agent.
      if (state === "waiting_analyst" || state === "agent") return "analyst";
      break;
    case "return_to_agent":
      if (state === "analyst" || state === "waiting_analyst") return "agent";
      break;
    case "close":
      if (state !== "closed") return "closed";
      break;
  }
  throw new InvalidTransitionError(`Evento "${event.type}" não é permitido no estado "${state}".`);
}
