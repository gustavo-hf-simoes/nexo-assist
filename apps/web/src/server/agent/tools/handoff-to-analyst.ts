import { randomUUID } from "node:crypto";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { handoffQueue, type HandoffReason } from "../../conversations/conversation-state";
import { InvalidTransitionError } from "../../conversations/errors";
import {
  TicketNotFoundError,
  TicketRequestError,
  TicketServiceUnavailableError,
} from "../../tickets/ticket-errors";
import { getConversationId, getEmployeeId } from "../request-context";
import type { ToolDeps } from "./tool-deps";

const REASONS = ["user_request", "critical", "overdue", "low_confidence"] as const satisfies readonly HandoffReason[];

export function handoffToAnalystTool(deps: ToolDeps) {
  return createTool({
    id: "handoff_to_analyst",
    description:
      "Transfere a conversa para um analista humano e, se houver ticketCode, o chamado também. Críticos e atrasados vão para a fila N2.",
    inputSchema: z.object({
      reason: z.enum(REASONS),
      summary: z.string().trim().min(1),
      ticketCode: z.string().trim().min(1).optional(),
    }),
    execute: async (input, context) => {
      const employeeId = getEmployeeId(context.requestContext);
      const conversationId = getConversationId(context.requestContext);
      try {
        await deps.conversations.apply(conversationId, {
          type: "handoff",
          reason: input.reason,
          summary: input.summary,
        });
      } catch (error) {
        if (error instanceof InvalidTransitionError) {
          return { ok: false as const, error: "already_transferred" as const };
        }
        throw error;
      }
      const queue = handoffQueue(input.reason);
      let ticketTransferred = false;
      if (input.ticketCode) {
        try {
          // Mesma chamada de tool reaproveita a chave; fora do agent (sem toolCallId) gera uma nova.
          const key = `handoff:${conversationId}:${context.agent?.toolCallId ?? randomUUID()}`;
          await deps.gateway.transfer(employeeId, input.ticketCode, { queue, summary: input.summary }, key);
          ticketTransferred = true;
        } catch (error) {
          // A conversa já foi transferida; falha do serviço de chamados não desfaz isso.
          const tolerated =
            error instanceof TicketServiceUnavailableError ||
            error instanceof TicketNotFoundError ||
            error instanceof TicketRequestError;
          if (!tolerated) throw error;
        }
      }
      return { ok: true as const, state: "waiting_analyst" as const, queue, ticketTransferred };
    },
  });
}
