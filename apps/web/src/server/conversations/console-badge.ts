import type { ConversationState } from "@nexo/domain";

export type BadgeTone = "danger" | "warning" | "success" | "neutral";
export interface ConversationBadge {
  tone: BadgeTone;
  text: string;
}

export interface BadgeInput {
  state: ConversationState;
  handoffReason: string | null;
  linkedTicketCode: string | null;
  // Confiança do último trace de decisão da conversa (só vale para handoff por baixa confiança).
  confidence: number | null;
  analystName: string | null;
}

export function badgeFor(input: BadgeInput): ConversationBadge {
  switch (input.state) {
    case "waiting_analyst":
      if (input.handoffReason === "low_confidence") {
        return {
          tone: "warning",
          text: input.confidence === null ? "Agent pediu ajuda" : `Agent pediu ajuda · confiança ${Math.round(input.confidence * 100)}%`,
        };
      }
      return { tone: "danger", text: input.linkedTicketCode ? `Transferida · ${input.linkedTicketCode}` : "Transferida" };
    case "analyst":
      return { tone: "success", text: `Em atendimento · ${input.analystName ?? "analista"}` };
    case "agent":
      return { tone: "success", text: "Agent atendendo" };
    case "closed":
      return { tone: "neutral", text: "Encerrada" };
  }
}
