import { canReopen, isOverdue, slaLabel } from "@nexo/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { TicketServiceUnavailableError } from "../../tickets/ticket-errors";
import { getEmployeeId } from "../request-context";
import { dueAtOf } from "./ticket-view";
import { nowOf, TICKETS_UNAVAILABLE, type ToolDeps } from "./tool-deps";

export function getTicketTool(deps: ToolDeps) {
  return createTool({
    id: "get_ticket",
    description:
      "Consulta um chamado do funcionário logado pelo código, com prazo, atraso e se pode ser reaberto. Chamado de outro usuário responde not_found.",
    inputSchema: z.object({ code: z.string().trim().min(1) }),
    execute: async (input, context) => {
      const employeeId = getEmployeeId(context.requestContext);
      try {
        const ticket = await deps.gateway.getMine(employeeId, input.code);
        if (!ticket) return { ok: false as const, error: "not_found" as const };
        const now = nowOf(deps);
        return {
          ok: true as const,
          ticket,
          dueAt: dueAtOf(ticket),
          overdue: isOverdue(ticket, now),
          slaLabel: slaLabel(ticket.priority),
          canReopen: canReopen(ticket, now),
        };
      } catch (error) {
        if (error instanceof TicketServiceUnavailableError) return TICKETS_UNAVAILABLE;
        throw error;
      }
    },
  });
}
