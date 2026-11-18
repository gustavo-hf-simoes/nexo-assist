import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { TicketServiceUnavailableError } from "../../tickets/ticket-errors";
import { getEmployeeId } from "../request-context";
import { significantWords } from "./text";
import { withSla } from "./ticket-view";
import { nowOf, TICKETS_UNAVAILABLE, type ToolDeps } from "./tool-deps";

export function searchMyTicketsTool(deps: ToolDeps) {
  return createTool({
    id: "search_my_tickets",
    description:
      "Lista os chamados do funcionário logado. Use para consultar chamados abertos ou o histórico, opcionalmente filtrando por um texto.",
    inputSchema: z.object({
      scope: z.enum(["open", "all"]).optional(),
      text: z.string().optional(),
    }),
    execute: async (input, context) => {
      const employeeId = getEmployeeId(context.requestContext);
      try {
        const tickets = await deps.gateway.listMine(employeeId, input.scope ?? "open");
        const words = significantWords(input.text ?? "");
        const matches =
          words.length === 0
            ? tickets
            : tickets.filter((t) => {
                const haystack = significantWords(`${t.code} ${t.title} ${t.description}`);
                return words.some((w) => haystack.includes(w));
              });
        const now = nowOf(deps);
        return { ok: true as const, tickets: matches.map((t) => withSla(t, now)) };
      } catch (error) {
        if (error instanceof TicketServiceUnavailableError) return TICKETS_UNAVAILABLE;
        throw error;
      }
    },
  });
}
