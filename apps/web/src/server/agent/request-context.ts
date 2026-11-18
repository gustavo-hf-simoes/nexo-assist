import { RequestContext } from "@mastra/core/request-context";

export interface EmployeeProfile {
  name: string;
  department: string;
  deviceOs: string | null;
}

export type Intent =
  | "question"
  | "ticket_status"
  | "ticket_update"
  | "ticket_create"
  | "ticket_reopen"
  | "handoff_request"
  | "out_of_scope"
  | "smalltalk"
  | "unclear";

export interface RecordedDecision {
  intent: Intent;
  understanding: string;
  action: string;
  confidence: number;
  rationale: string;
}

// Chaves tipadas do RequestContext do Mastra (@mastra/core 1.x). `decision` é preenchida por
// record_decision; a rota de chat (Task 12) lê e grava em decision_traces junto do id da mensagem.
export type NexoContextValues = {
  employeeId: string;
  conversationId: string;
  sessionId: string;
  profile: EmployeeProfile;
  decision?: RecordedDecision;
};

export type NexoRequestContext = RequestContext<NexoContextValues>;

export function createNexoRequestContext(values: Omit<NexoContextValues, "decision">): NexoRequestContext {
  return new RequestContext<NexoContextValues>([
    ["employeeId", values.employeeId],
    ["conversationId", values.conversationId],
    ["sessionId", values.sessionId],
    ["profile", values.profile],
  ]);
}

// Leitura estrutural: o `requestContext` que o Mastra entrega à tool não carrega o tipo do contexto.
export interface ContextReader {
  getRaw(key: string): unknown;
}
export interface ContextWriter extends ContextReader {
  setRaw(key: string, value: unknown): void;
}

function requireString(ctx: ContextReader, key: string): string {
  const value = ctx.getRaw(key);
  if (typeof value !== "string" || value === "") {
    throw new Error(`Contexto da requisição sem "${key}".`);
  }
  return value;
}

export function getEmployeeId(ctx: ContextReader): string {
  return requireString(ctx, "employeeId");
}

export function getConversationId(ctx: ContextReader): string {
  return requireString(ctx, "conversationId");
}

export function getRecordedDecision(ctx: ContextReader): RecordedDecision | undefined {
  return ctx.getRaw("decision") as RecordedDecision | undefined;
}
