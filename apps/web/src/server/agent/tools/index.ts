import type { ToolId } from "./action-labels";
import { classifyPriorityTool } from "./classify-priority";
import { getTicketTool } from "./get-ticket";
import { handoffToAnalystTool } from "./handoff-to-analyst";
import { prepareTicketDraftTool } from "./prepare-ticket-draft";
import { presentChoicesTool } from "./present-choices";
import { recordDecisionTool } from "./record-decision";
import { searchHelpCenterTool } from "./search-help-center";
import { searchMyTicketsTool } from "./search-my-tickets";
import type { ToolDeps } from "./tool-deps";

export type { ToolDeps } from "./tool-deps";
export type { ToolId } from "./action-labels";

// O funcionário vem sempre do RequestContext; nenhuma tool recebe employeeId do modelo.
export function buildTools(deps: ToolDeps) {
  const tools = {
    search_my_tickets: searchMyTicketsTool(deps),
    get_ticket: getTicketTool(deps),
    search_help_center: searchHelpCenterTool(deps),
    classify_priority: classifyPriorityTool(deps),
    prepare_ticket_draft: prepareTicketDraftTool(deps),
    present_choices: presentChoicesTool(),
    handoff_to_analyst: handoffToAnalystTool(deps),
    record_decision: recordDecisionTool(),
  } satisfies Record<ToolId, unknown>;
  return tools;
}
