import type { ModelMessage } from "ai";
import { createNexoAgent, MAX_STEPS } from "../src/server/agent/nexo-agent";
import { createNexoRequestContext, getRecordedDecision, type Intent } from "../src/server/agent/request-context";
import type { ToolDeps } from "../src/server/agent/tools";
import { SEED_USERS } from "../src/server/db/seed";
import { toDraftView, type DraftView, type NewDraftInput } from "../src/server/drafts/draft-types";
import { FakeTicketGateway } from "../tests/fakes/fake-ticket-gateway";
import { FakeConversations } from "../tests/fakes/tool-fakes";
import { searchSeedArticles } from "./in-memory-articles";
import { extractToolCalls } from "./observe";
import type { Scenario } from "./scenarios";
import type { Observed, ObservedToolCall } from "./score";

export interface ScenarioRun {
  observed: Observed;
  tokens: number;
  ms: number;
}

export interface HarnessOptions {
  modelId: string;
  now?: () => Date;
}

// Guarda o rascunho que o agent montou, no mesmo formato que a UI recebe.
type DraftsPort = ToolDeps["drafts"];

class RecordingDrafts implements DraftsPort {
  readonly views: DraftView[] = [];
  async createDraft(input: NewDraftInput): Promise<DraftView> {
    const view = toDraftView({
      id: `00000000-0000-4000-8000-${String(this.views.length + 1).padStart(12, "0")}`,
      displayCode: `D-${this.views.length + 1}`,
      kind: input.kind,
      targetTicketCode: input.targetTicketCode ?? null,
      payload: input.payload,
      status: "pending",
    });
    this.views.push(view);
    return view;
  }
}

// Roda a conversa do cenário contra o agent real (ou roteirizado), com chamados e artigos em memória.
export async function runScenario(scenario: Scenario, options: HarnessOptions): Promise<ScenarioRun> {
  const user = SEED_USERS.find((u) => u.id === scenario.employee);
  if (!user) throw new Error(`Funcionário do cenário não existe no seed: ${scenario.employee}`);
  const now = options.now ?? (() => new Date());
  const gateway = new FakeTicketGateway(now());
  const conversations = new FakeConversations();
  const drafts = new RecordingDrafts();
  const agent = createNexoAgent({
    gateway,
    conversations,
    drafts,
    searchArticles: searchSeedArticles,
    modelId: options.modelId,
    now,
  });

  const history: ModelMessage[] = [];
  const toolCalls: ObservedToolCall[] = [];
  let intent: Intent | undefined;
  let answer = "";
  let tokens = 0;
  const startedAt = Date.now();

  for (const text of scenario.turns) {
    history.push({ role: "user", content: text });
    // Um contexto por turno: a decisão registrada pelo turno anterior não vale para o seguinte.
    const requestContext = createNexoRequestContext({
      employeeId: user.id,
      conversationId: "eval-conversation",
      sessionId: "eval-session",
      profile: { name: user.name, department: user.department ?? "não informado", deviceOs: user.deviceOs ?? null },
    });
    // stream + getFullOutput, como a rota de chat: o modelo roteirizado só implementa o stream.
    const output = await agent.stream(history, { requestContext, maxSteps: MAX_STEPS });
    const result = await output.getFullOutput();
    toolCalls.push(...extractToolCalls(result.steps));
    intent = getRecordedDecision(requestContext)?.intent;
    answer = result.text;
    tokens += result.totalUsage?.totalTokens ?? 0;
    if (result.text.trim() !== "") history.push({ role: "assistant", content: result.text });
  }

  const handoffEvent = [...conversations.events].reverse().find((e) => e.type === "handoff");
  return {
    observed: {
      toolCalls,
      intent,
      draft: drafts.views.at(-1),
      handoff: handoffEvent?.type === "handoff" ? handoffEvent.reason : undefined,
      answer,
    },
    tokens,
    ms: Date.now() - startedAt,
  };
}
