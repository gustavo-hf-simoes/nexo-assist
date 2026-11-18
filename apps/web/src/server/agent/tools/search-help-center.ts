import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ToolDeps } from "./tool-deps";

export function searchHelpCenterTool(deps: ToolDeps) {
  return createTool({
    id: "search_help_center",
    description: "Busca artigos na central de ajuda de TI para orientar o funcionário antes de abrir um chamado.",
    inputSchema: z.object({ query: z.string().trim().min(1) }),
    execute: async (input) => ({ ok: true as const, articles: await deps.searchArticles(input.query) }),
  });
}
