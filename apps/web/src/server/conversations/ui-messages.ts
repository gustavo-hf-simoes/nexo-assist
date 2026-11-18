import type { StoredMessage } from "./conversation-repository";

export interface UiTrace {
  intent: string;
  understanding: string;
  action: string;
  confidence: number | null;
  rationale: string;
  tools: unknown;
  model: string;
  latencyMs: number;
}

// Forma que a UI (useChat) consome: o trace vem anexado às mensagens do agent.
export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  author: StoredMessage["author"];
  authorName?: string;
  createdAt: string;
  parts: unknown[];
  trace?: UiTrace;
}

export function toUiMessage(row: StoredMessage): UiMessage {
  const stored = Array.isArray(row.parts) ? (row.parts as unknown[]) : null;
  const message: UiMessage = {
    id: row.id,
    role: row.author === "employee" ? "user" : row.author === "system" ? "system" : "assistant",
    author: row.author,
    createdAt: row.createdAt.toISOString(),
    parts: stored ?? [{ type: "text", text: row.content }],
  };
  if (row.author === "analyst" && row.authorName) message.authorName = row.authorName;
  if (row.author === "agent" && row.trace) {
    message.trace = {
      intent: row.trace.intent,
      understanding: row.trace.understanding,
      action: row.trace.action,
      confidence: row.trace.confidence,
      rationale: row.trace.rationale,
      tools: row.trace.tools,
      model: row.trace.model,
      latencyMs: row.trace.latencyMs,
    };
  }
  return message;
}
