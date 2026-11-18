import type { UIMessage } from "ai";
import type { ConversationState } from "@nexo/domain";
import type { DraftView } from "@/server/drafts/draft-types";
import type { UiMessage, UiTrace } from "@/server/conversations/ui-messages";

export type { DraftView, UiTrace };

export interface ChatMetadata {
  author?: UiMessage["author"];
  authorName?: string;
  createdAt?: string;
  trace?: UiTrace;
}
export type ChatMessage = UIMessage<ChatMetadata>;

export interface ConversationSnapshot {
  conversation: { id: string; state: ConversationState; handoffReason: string | null };
  messages: UiMessage[];
  quota: { used: number; limit: number };
  drafts: DraftView[];
}

// Uma tool que rodou no turno, no formato dos chips e do detalhe da decisão.
export interface ChipTool {
  id: string;
  labels: string[];
  ok: boolean;
  input?: unknown;
  output?: unknown;
}

export function toChatMessage(message: UiMessage): ChatMessage {
  const metadata: ChatMetadata = { author: message.author, createdAt: message.createdAt };
  if (message.authorName) metadata.authorName = message.authorName;
  if (message.trace) metadata.trace = message.trace;
  return { id: message.id, role: message.role, parts: message.parts as ChatMessage["parts"], metadata };
}

export const PAUSED_STATES: readonly ConversationState[] = ["waiting_analyst", "analyst"];
