import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ContextWriter } from "../request-context";

export const INTENTS = [
  "question",
  "ticket_status",
  "ticket_update",
  "ticket_create",
  "ticket_reopen",
  "handoff_request",
  "out_of_scope",
  "smalltalk",
  "unclear",
] as const;

// Não grava em banco: a decisão fica na chave `decision` do RequestContext e a rota de chat
// (Task 12) a persiste em decision_traces com o id da mensagem do agent.
export function recordDecisionTool() {
  return createTool({
    id: "record_decision",
    description:
      "Registra a intenção, o entendimento, a ação escolhida e a confiança deste turno. Chame uma vez por turno.",
    inputSchema: z.object({
      intent: z.enum(INTENTS),
      understanding: z.string().trim().min(1),
      action: z.string().trim().min(1),
      confidence: z.number().min(0).max(1),
      rationale: z.string().trim().min(1),
    }),
    execute: async (input, context) => {
      (context.requestContext as ContextWriter).setRaw("decision", input);
      return { recorded: true as const };
    },
  });
}
