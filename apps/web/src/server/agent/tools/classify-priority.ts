import { classifyPriority, computeDueAt, ImpactSchema, slaLabel, TicketTypeSchema } from "@nexo/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { nowOf, type ToolDeps } from "./tool-deps";

export function classifyPriorityTool(deps: ToolDeps) {
  return createTool({
    id: "classify_priority",
    description:
      "Calcula a prioridade, o prazo e o SLA de um chamado a partir do impacto. A prioridade nunca é escolhida pelo modelo.",
    inputSchema: z.object({
      type: TicketTypeSchema,
      impact: ImpactSchema,
      blocksWork: z.boolean(),
      sameDayDeadline: z.boolean(),
    }),
    execute: async (input) => {
      const { priority, reason } = classifyPriority(input);
      return {
        priority,
        reason,
        dueAt: computeDueAt(priority, nowOf(deps)).toISOString(),
        slaLabel: slaLabel(priority),
      };
    },
  });
}
