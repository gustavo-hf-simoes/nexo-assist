import { TOOL_IDS, type ToolId } from "../src/server/agent/tools/action-labels";
import type { ObservedToolCall } from "./score";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolId(name: unknown): name is ToolId {
  return typeof name === "string" && (TOOL_IDS as readonly string[]).includes(name);
}

// Os passos do Mastra trazem cada chamada dentro de `payload`; aceita também o formato achatado do AI SDK.
function unwrap(entry: unknown): Record<string, unknown> | undefined {
  if (!isRecord(entry)) return undefined;
  return isRecord(entry["payload"]) ? entry["payload"] : entry;
}

function failed(result: Record<string, unknown> | undefined): boolean {
  if (!result) return false;
  if (result["isError"] === true) return true;
  const value = result["result"] ?? result["output"];
  return isRecord(value) && value["ok"] === false;
}

export function extractToolCalls(steps: unknown): ObservedToolCall[] {
  if (!Array.isArray(steps)) return [];
  const calls: ObservedToolCall[] = [];
  for (const step of steps) {
    if (!isRecord(step)) continue;
    const results = Array.isArray(step["toolResults"]) ? step["toolResults"].map(unwrap) : [];
    for (const entry of Array.isArray(step["toolCalls"]) ? step["toolCalls"] : []) {
      const call = unwrap(entry);
      if (!call || !isToolId(call["toolName"])) continue;
      const result = results.find((r) => r?.["toolCallId"] === call["toolCallId"]);
      calls.push({ id: call["toolName"], input: call["args"] ?? call["input"] ?? null, ok: !failed(result) });
    }
  }
  return calls;
}
