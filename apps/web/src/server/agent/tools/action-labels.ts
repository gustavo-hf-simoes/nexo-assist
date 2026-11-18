export const TOOL_IDS = [
  "search_my_tickets",
  "get_ticket",
  "search_help_center",
  "classify_priority",
  "prepare_ticket_draft",
  "present_choices",
  "handoff_to_analyst",
  "record_decision",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

// Chips de ação mostrados na UI. Lista vazia = a tool não gera chip.
export const ACTION_LABELS: Record<ToolId, readonly string[]> = {
  search_my_tickets: ["consultou seus chamados"],
  get_ticket: ["consultou o {code}", "calculou o prazo"],
  search_help_center: ["buscou na central de ajuda"],
  classify_priority: ["classificou a prioridade", "consultou o SLA"],
  prepare_ticket_draft: ["montou o rascunho"],
  present_choices: [],
  handoff_to_analyst: ["chamou um analista"],
  record_decision: [],
};

export function actionLabelsFor(toolId: ToolId, args: { code?: string } = {}): string[] {
  return ACTION_LABELS[toolId].map((label) => label.replace("{code}", args.code ?? ""));
}
