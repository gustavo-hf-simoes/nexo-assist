import type { ConversationEvent } from "../conversations/conversation-state";
import { actionLabelsFor, TOOL_IDS, type ToolId } from "./tools/action-labels";
import type { Intent, RecordedDecision } from "./request-context";

// Forma mínima dos passos do Mastra (`onFinish.steps`) que o trace usa; os testes não precisam do tipo completo.
export interface TraceStep {
  toolCalls: ReadonlyArray<{ payload: { toolCallId: string; toolName: string; args?: unknown } }>;
  toolResults: ReadonlyArray<{
    payload: { toolCallId: string; toolName: string; result?: unknown; isError?: boolean };
  }>;
}

export interface TraceTool {
  id: ToolId;
  labels: string[];
  input: unknown;
  output: unknown;
  ok: boolean;
}

export interface DecisionTrace {
  intent: Intent;
  understanding: string;
  action: string;
  confidence: number | null;
  rationale: string;
  tools: TraceTool[];
  model: string;
  latencyMs: number;
}

const HIDDEN_TOOLS: readonly ToolId[] = ["record_decision"];

function isToolId(name: string): name is ToolId {
  return (TOOL_IDS as readonly string[]).includes(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resultOk(result: { result?: unknown; isError?: boolean } | undefined): boolean {
  if (!result || result.isError === true) return false;
  return !(isRecord(result.result) && result.result["ok"] === false);
}

// Resume o turno: a decisão vem do record_decision que a tool aceitou; as tools viram chips com labels.
export function buildDecisionTrace(steps: readonly TraceStep[], startedAt: number, model: string): DecisionTrace {
  const tools: TraceTool[] = [];
  let decision: RecordedDecision | undefined;
  for (const step of steps) {
    for (const { payload: call } of step.toolCalls) {
      if (!isToolId(call.toolName)) continue;
      const result = step.toolResults.find((r) => r.payload.toolCallId === call.toolCallId)?.payload;
      const ok = resultOk(result);
      if (call.toolName === "record_decision") {
        if (ok && isRecord(call.args)) decision = call.args as unknown as RecordedDecision;
        continue;
      }
      if (HIDDEN_TOOLS.includes(call.toolName)) continue;
      const code = isRecord(call.args) && typeof call.args["code"] === "string" ? call.args["code"] : undefined;
      tools.push({
        id: call.toolName,
        labels: actionLabelsFor(call.toolName, code === undefined ? {} : { code }),
        input: call.args ?? null,
        output: result?.result ?? null,
        ok,
      });
    }
  }
  return {
    intent: decision?.intent ?? "unclear",
    understanding: decision?.understanding ?? "",
    action: decision?.action ?? "",
    confidence: decision?.confidence ?? null,
    rationale: decision?.rationale ?? "",
    tools,
    model,
    latencyMs: Math.max(0, Date.now() - startedAt),
  };
}

// Confiança baixa vira transferência, salvo se o agent já chamou um analista neste turno.
export function applyPostTurnPolicy(trace: DecisionTrace, minConfidence: number): ConversationEvent | null {
  if (trace.confidence === null || trace.confidence >= minConfidence) return null;
  if (trace.tools.some((t) => t.id === "handoff_to_analyst" && t.ok)) return null;
  return {
    type: "handoff",
    reason: "low_confidence",
    summary: trace.understanding || "O assistente não teve certeza de como ajudar.",
  };
}
