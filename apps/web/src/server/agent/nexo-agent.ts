import { Agent } from "@mastra/core/agent";
import { buildInstructions } from "./instructions";
import { DEFAULT_AGENT_MODEL, resolveModel } from "./model";
import type { EmployeeProfile } from "./request-context";
import { buildTools, type ToolDeps } from "./tools";

export const MAX_STEPS = 6;

export interface NexoAgentDeps extends ToolDeps {
  modelId?: string;
}

export function createNexoAgent(deps: NexoAgentDeps) {
  const modelId = deps.modelId ?? DEFAULT_AGENT_MODEL;
  return new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: ({ requestContext }) => {
      const profile = requestContext.get("profile") as EmployeeProfile;
      return buildInstructions(profile, deps.now ? deps.now() : new Date());
    },
    model: resolveModel(modelId),
    tools: buildTools(deps),
    defaultOptions: { maxSteps: MAX_STEPS },
  });
}

export type NexoAgent = ReturnType<typeof createNexoAgent>;
