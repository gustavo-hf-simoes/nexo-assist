import type { ConversationState } from "@nexo/domain";
import { toAISdkStream } from "@mastra/ai-sdk";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "../db/app-db";
import type { Database } from "../db/client";
import { conversations, decisionTraces, messages, users } from "../db/schema";
import { env } from "../config/env";
import { ConversationService } from "../conversations/conversation-service";
import type { ConversationRow } from "../conversations/conversation-repository";
import { InvalidTransitionError, QuotaExceededError } from "../conversations/errors";
import { MessageQuota } from "../conversations/message-quota";
import { DraftService } from "../drafts/draft-service";
import { searchArticles } from "../knowledge/knowledge-base";
import { createTicketGateway } from "../tickets/ticket-gateway-factory";
import type { TicketGateway } from "../tickets/ticket-gateway";
import { applyPostTurnPolicy, buildDecisionTrace, type DecisionTrace, type TraceStep } from "./decision-trace";
import { DEFAULT_AGENT_MODEL } from "./model";
import { createNexoAgent, MAX_STEPS, type NexoAgent } from "./nexo-agent";
import { createNexoRequestContext } from "./request-context";
import { DailyUsageLimit } from "./usage-limit";

export type TurnResult =
  // `done` resolve quando o turno terminou de gravar; a rota o entrega ao after() para a plataforma não congelar a função antes.
  | { kind: "stream"; response: Response; done: Promise<void> }
  | { kind: "paused"; state: ConversationState }
  | { kind: "quota_exceeded"; used: number; limit: number }
  | { kind: "daily_limit" };

export interface TurnSession {
  sid: string;
  userId: string;
  name: string;
}

export interface TurnDeps {
  db: Database;
  conversations: ConversationService;
  quota: MessageQuota;
  usage: DailyUsageLimit;
  agent: NexoAgent;
  modelId: string;
  minConfidence: number;
  // Prazo do turno: abaixo do maxDuration da rota (60 s), para o turno terminar com aviso antes da plataforma cortar.
  turnTimeoutMs: number;
}

export const PERSIST_ERROR_TEXT = "Não consegui salvar esta resposta no histórico. Ela pode não aparecer ao recarregar a conversa.";

const PERSIST_WAIT_MS = 10_000;

export const TURN_ERROR_TEXT = "Não consegui processar sua mensagem agora. Tente novamente em instantes.";

// Fica no histórico quando o turno falha, para quem recarrega a conversa (funcionário ou analista) saber que não houve resposta.
export const TURN_FAILED_NOTICE = "O assistente não conseguiu responder a esta mensagem. Envie de novo em instantes.";

export const TURN_TIMEOUT_MS = 45_000;

export interface TurnConfig {
  db: Database;
  gateway: TicketGateway;
  modelId: string;
  minConfidence: number;
  sessionLimit: number;
  dailyLimit: number;
}

export function createTurnDeps(config: TurnConfig): TurnDeps {
  const conversations = new ConversationService(config.db);
  const drafts = new DraftService(config.db, config.gateway, conversations);
  return {
    db: config.db,
    conversations,
    quota: new MessageQuota(config.db, config.sessionLimit),
    usage: new DailyUsageLimit(config.dailyLimit, config.db),
    agent: createNexoAgent({
      gateway: config.gateway,
      conversations,
      drafts,
      searchArticles: (query) => searchArticles(query, 3, config.db),
      modelId: config.modelId,
    }),
    modelId: config.modelId,
    minConfidence: config.minConfidence,
    turnTimeoutMs: TURN_TIMEOUT_MS,
  };
}

let cachedDeps: TurnDeps | undefined;

export function defaultTurnDeps(): TurnDeps {
  cachedDeps ??= createTurnDeps({
    db: getDb(),
    gateway: createTicketGateway(),
    modelId: env.NEXO_AGENT_MODEL ?? DEFAULT_AGENT_MODEL,
    minConfidence: env.AGENT_MIN_CONFIDENCE,
    sessionLimit: env.SESSION_MESSAGE_LIMIT,
    dailyLimit: env.DAILY_LLM_TURN_LIMIT,
  });
  return cachedDeps;
}

interface FinishedStep extends TraceStep {
  text: string;
}

// Partes de UI guardadas junto da mensagem do agent, no mesmo formato do stream (texto + partes de tool).
function uiPartsOf(steps: readonly FinishedStep[], text: string): unknown[] {
  const parts: unknown[] = [];
  for (const step of steps) {
    for (const { payload: call } of step.toolCalls) {
      if (call.toolName === "record_decision") continue;
      const result = step.toolResults.find((r) => r.payload.toolCallId === call.toolCallId)?.payload;
      parts.push({
        type: `tool-${call.toolName}`,
        toolCallId: call.toolCallId,
        state: "output-available",
        input: call.args ?? null,
        output: result?.result ?? null,
      });
    }
  }
  if (text) parts.push({ type: "text", text });
  return parts;
}

async function persistAgentTurn(
  deps: TurnDeps,
  conversationId: string,
  steps: readonly FinishedStep[],
  trace: DecisionTrace,
): Promise<void> {
  const text = steps
    .map((s) => s.text.trim())
    .filter((t) => t !== "")
    .join("\n\n");
  const persisted = await deps.db.transaction(async (tx) => {
    // Trava a conversa: se o analista assumiu (ou ela fechou) durante o turno, o agent não responde.
    const [conv] = await tx
      .select({ state: conversations.state })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for("update");
    if (!conv || conv.state === "analyst" || conv.state === "closed") return false;
    const [row] = await tx
      .insert(messages)
      .values({ conversationId, author: "agent", content: text, parts: uiPartsOf(steps, text) })
      .returning({ id: messages.id });
    if (!row) throw new Error("Falha ao gravar a mensagem do agent.");
    await tx.insert(decisionTraces).values({
      messageId: row.id,
      intent: trace.intent,
      understanding: trace.understanding,
      action: trace.action,
      confidence: trace.confidence,
      rationale: trace.rationale,
      tools: trace.tools,
      model: trace.model,
      latencyMs: trace.latencyMs,
    });
    return true;
  });
  if (!persisted) {
    console.warn("[run-turn] resposta do agent descartada: a conversa saiu do agent durante o turno");
    return;
  }
  const event = applyPostTurnPolicy(trace, deps.minConfidence);
  if (!event) return;
  try {
    await deps.conversations.apply(conversationId, event);
  } catch (error) {
    // Outro evento (analista assumiu, handoff por tool) já mudou o estado; não há o que transferir.
    if (!(error instanceof InvalidTransitionError)) throw error;
  }
}

async function loadProfile(db: Database, session: TurnSession) {
  const [row] = await db
    .select({ department: users.department, deviceOs: users.deviceOs })
    .from(users)
    .where(eq(users.id, session.userId));
  return { name: session.name, department: row?.department ?? "não informado", deviceOs: row?.deviceOs ?? null };
}

function logFailure(error: unknown): void {
  // Só a mensagem vai para o log do servidor; nada disso chega ao cliente.
  console.error("[run-turn] falha no turno:", error instanceof Error ? error.message : "erro desconhecido");
}

export async function runTurn(
  input: { session: TurnSession; text: string },
  deps: TurnDeps = defaultTurnDeps(),
): Promise<TurnResult> {
  const { session, text } = input;
  const conversation: ConversationRow = await deps.conversations.getOrCreateCurrent(session.userId);

  // 1. Fora do estado agent o assistente não responde: só guarda a mensagem. A cota da sessão vale
  // também aqui (o limite diário de LLM não, pois o modelo não roda).
  if (conversation.state !== "agent") {
    try {
      await deps.quota.consume(session.sid);
    } catch (error) {
      if (error instanceof QuotaExceededError) return { kind: "quota_exceeded", ...(await deps.quota.peek(session.sid)) };
      throw error;
    }
    try {
      await deps.conversations.appendMessage(conversation.id, { author: "employee", authorId: session.userId, content: text });
    } catch (error) {
      await Promise.allSettled([deps.quota.refund(session.sid)]);
      throw error;
    }
    return { kind: "paused", state: conversation.state };
  }

  // 2. Limite diário e 3. cota da sessão. Se a cota falhar, o turno diário volta (o modelo não foi chamado).
  if (!(await deps.usage.consume())) return { kind: "daily_limit" };
  try {
    await deps.quota.consume(session.sid);
  } catch (error) {
    await deps.usage.refund();
    if (error instanceof QuotaExceededError) return { kind: "quota_exceeded", ...(await deps.quota.peek(session.sid)) };
    throw error;
  }

  // 4. Grava a mensagem do funcionário; ela fica mesmo se o modelo falhar.
  // Se algo falhar antes do stream começar, os dois contadores voltam (o modelo não foi chamado).
  let history;
  let requestContext;
  try {
    await deps.conversations.appendMessage(conversation.id, { author: "employee", authorId: session.userId, content: text });
    history = await deps.conversations.history(conversation.id, 20);
    requestContext = createNexoRequestContext({
      employeeId: session.userId,
      conversationId: conversation.id,
      sessionId: session.sid,
      profile: await loadProfile(deps.db, session),
    });
  } catch (error) {
    await Promise.allSettled([deps.usage.refund(), deps.quota.refund(session.sid)]);
    throw error;
  }
  const startedAt = Date.now();

  // 5. Stream do agent para o formato de UI message do AI SDK.
  const stream = createUIMessageStream({
    onError: (error) => {
      logFailure(error);
      return TURN_ERROR_TEXT;
    },
    execute: async ({ writer }) => {
      let failed = false;
      let aborted = false;
      let persistFailed = false;
      let settled!: () => void;
      const persisted = new Promise<void>((resolve) => {
        settled = resolve;
      });
      // Falha (erro do modelo ou prazo estourado): registra o aviso uma vez só e libera a espera da gravação.
      const fail = (error: unknown): void => {
        if (failed) return;
        failed = true;
        logFailure(error);
        void deps.conversations
          .appendMessage(conversation.id, { author: "system", content: TURN_FAILED_NOTICE })
          .catch(logFailure)
          .finally(settled);
      };
      const output = await deps.agent.stream(history, {
        requestContext,
        maxSteps: MAX_STEPS,
        abortSignal: AbortSignal.timeout(deps.turnTimeoutMs),
        onAbort: () => {
          aborted = true;
          fail(new Error(`turno cancelado após ${deps.turnTimeoutMs} ms sem resposta do modelo`));
        },
        onError: (error) => fail(error),
        onFinish: async (event) => {
          if (failed) return;
          if (event.error !== undefined || event.finishReason === "error") {
            fail(event.error ?? new Error("o modelo terminou com erro"));
            return;
          }
          try {
            const steps = event.steps as unknown as FinishedStep[];
            await persistAgentTurn(deps, conversation.id, steps, buildDecisionTrace(steps, startedAt, deps.modelId));
          } catch (error) {
            persistFailed = true;
            logFailure(error);
          } finally {
            settled();
          }
        },
      });
      // Ao fim do stream, espera a gravação (com limite) e, se falhou, avisa o cliente com um erro em pt-BR.
      const withPersistNotice = new TransformStream({
        async flush(controller) {
          await Promise.race([persisted, new Promise((resolve) => setTimeout(resolve, PERSIST_WAIT_MS))]);
          if (aborted) controller.enqueue({ type: "error", errorText: TURN_ERROR_TEXT });
          if (persistFailed) controller.enqueue({ type: "error", errorText: PERSIST_ERROR_TEXT });
        },
      });
      writer.merge(
        (
          toAISdkStream(output, {
            from: "agent",
            version: "v7",
            onError: (error) => {
              logFailure(error);
              return TURN_ERROR_TEXT;
            },
          }) as unknown as ReadableStream<unknown>
        ).pipeThrough(withPersistNotice) as unknown as ReadableStream<never>,
      );
    },
  });
  let consumed!: () => void;
  const done = new Promise<void>((resolve) => {
    consumed = resolve;
  });
  return {
    kind: "stream",
    response: createUIMessageStreamResponse({
      stream,
      // Uma cópia do stream é consumida no servidor: o turno termina (e grava) mesmo se o cliente desconectar.
      consumeSseStream: ({ stream: copy }) => {
        void copy
          .pipeTo(new WritableStream())
          .catch(logFailure)
          .finally(() => consumed());
      },
    }),
    done,
  };
}
