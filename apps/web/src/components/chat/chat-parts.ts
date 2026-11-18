import { actionLabelsFor, TOOL_IDS, type ToolId } from "@/server/agent/tools/action-labels";
import type { ChipTool, ChatMessage } from "./chat-types";

export interface RawPart {
  type: string;
  [key: string]: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function partsOf(message: Pick<ChatMessage, "parts">): RawPart[] {
  return (message.parts as unknown[]).filter((p): p is RawPart => isRecord(p) && typeof p["type"] === "string");
}

export function textOf(message: Pick<ChatMessage, "parts">): string {
  return partsOf(message)
    .filter((p) => p.type === "text" && typeof p["text"] === "string")
    .map((p) => p["text"] as string)
    .join("\n\n")
    .trim();
}

// `tool-<nome>` (estático) ou `dynamic-tool` com toolName.
export function toolNameOf(part: RawPart): string | null {
  if (part.type === "dynamic-tool") return typeof part["toolName"] === "string" ? part["toolName"] : null;
  return part.type.startsWith("tool-") ? part.type.slice("tool-".length) : null;
}

export function isToolDone(part: RawPart): boolean {
  return part["state"] === "output-available";
}

export function findTool(parts: readonly RawPart[], name: string): RawPart | undefined {
  return parts.find((p) => toolNameOf(p) === name && isToolDone(p));
}

function isToolId(name: string): name is ToolId {
  return (TOOL_IDS as readonly string[]).includes(name);
}

function outputOk(output: unknown): boolean {
  return !(isRecord(output) && output["ok"] === false);
}

// Chips a partir das partes da mensagem (mensagem ao vivo, ainda sem trace gravado).
export function chipsFromParts(parts: readonly RawPart[]): ChipTool[] {
  const chips: ChipTool[] = [];
  for (const part of parts) {
    const name = toolNameOf(part);
    if (!name || !isToolId(name) || !isToolDone(part)) continue;
    const input = part["input"];
    const code = isRecord(input) && typeof input["code"] === "string" ? input["code"] : undefined;
    const labels = actionLabelsFor(name, code === undefined ? {} : { code });
    if (labels.length === 0) continue;
    chips.push({ id: name, labels, ok: outputOk(part["output"]), input, output: part["output"] });
  }
  return chips;
}

// Normaliza o `tools` do trace (guardado como unknown) para os chips.
export function chipsFromTrace(tools: unknown): ChipTool[] {
  if (!Array.isArray(tools)) return [];
  const chips: ChipTool[] = [];
  for (const tool of tools as unknown[]) {
    if (!isRecord(tool) || typeof tool["id"] !== "string") continue;
    const labels = Array.isArray(tool["labels"]) ? (tool["labels"] as unknown[]).filter((l): l is string => typeof l === "string") : [];
    chips.push({ id: tool["id"], labels, ok: tool["ok"] !== false, input: tool["input"], output: tool["output"] });
  }
  return chips;
}
