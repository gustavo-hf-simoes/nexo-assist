import type { ConversationState } from "@nexo/domain";
import { createNexoRequestContext, type NexoRequestContext } from "../../src/server/agent/request-context";
import type { ToolDeps } from "../../src/server/agent/tools/tool-deps";
import { transition, type ConversationEvent } from "../../src/server/conversations/conversation-state";
import { toDraftView, type DraftView, type NewDraftInput } from "../../src/server/drafts/draft-types";
import { FakeTicketGateway } from "./fake-ticket-gateway";

export class FakeConversations {
  state: ConversationState = "agent";
  readonly events: ConversationEvent[] = [];
  async apply(_conversationId: string, event: ConversationEvent): Promise<void> {
    this.state = transition(this.state, event);
    this.events.push(event);
  }
}

export class FakeDrafts {
  readonly created: NewDraftInput[] = [];
  async createDraft(input: NewDraftInput): Promise<DraftView> {
    this.created.push(input);
    return toDraftView({
      id: "00000000-0000-4000-8000-000000000001",
      displayCode: "D-381",
      kind: input.kind,
      targetTicketCode: input.targetTicketCode ?? null,
      payload: input.payload,
      status: "pending",
    });
  }
}

export function makeHarness(employeeId = "ana.souza") {
  const gateway = new FakeTicketGateway();
  const conversations = new FakeConversations();
  const drafts = new FakeDrafts();
  const deps: ToolDeps = {
    gateway,
    conversations,
    drafts,
    searchArticles: async () => [{ slug: "vpn", title: "VPN", body: "Reinicie o cliente.", rank: 1 }],
  };
  const ctx: NexoRequestContext = createNexoRequestContext({
    employeeId,
    conversationId: "conv-1",
    sessionId: "sess-1",
    profile: { name: "Ana Souza", department: "Financeiro", deviceOs: "Windows 11" },
  });
  return { gateway, conversations, drafts, deps, ctx };
}

interface ExecutableTool {
  execute?: (input: never, context: never) => Promise<unknown>;
}

// Executa a tool como o Mastra faz e falha se a validação do input recusar.
export async function run(tool: ExecutableTool, input: unknown, ctx: NexoRequestContext): Promise<unknown> {
  if (!tool.execute) throw new Error("tool sem execute");
  const out = await tool.execute(input as never, { requestContext: ctx } as never);
  if (typeof out === "object" && out !== null && (out as { error?: unknown }).error === true) {
    throw new Error(`validação falhou: ${JSON.stringify(out)}`);
  }
  return out;
}
