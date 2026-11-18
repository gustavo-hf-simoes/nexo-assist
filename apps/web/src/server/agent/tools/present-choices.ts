import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const optionSchema = z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) });

export const presentChoicesInput = z.object({
  question: z.string().trim().min(1),
  kind: z.enum(["quick_reply", "ticket_choice"]),
  options: z.array(optionSchema).min(2).max(4),
});

// Só renderiza as opções na UI; a escolha volta como a próxima mensagem do funcionário.
export function presentChoicesTool() {
  return createTool({
    id: "present_choices",
    description: "Mostra de 2 a 4 opções clicáveis ao funcionário (respostas rápidas ou escolha de chamado).",
    inputSchema: presentChoicesInput,
    execute: async (input) => ({ ...input, renderOnly: true as const }),
  });
}
