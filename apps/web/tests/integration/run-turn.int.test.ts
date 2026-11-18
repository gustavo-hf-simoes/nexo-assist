import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { scriptedCallCount, setScript, type ScriptStep } from "../../src/server/agent/model";
import { createNexoAgent } from "../../src/server/agent/nexo-agent";
import { createNexoRequestContext, getRecordedDecision } from "../../src/server/agent/request-context";
import { createTurnDeps, runTurn, type TurnDeps } from "../../src/server/agent/run-turn";
import { ConversationService } from "../../src/server/conversations/conversation-service";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { authSessions, conversations, dailyUsage, decisionTraces, messages } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";
import { FakeTicketGateway } from "../fakes/fake-ticket-gateway";

const decision = (confidence: number) => ({
  name: "record_decision",
  input: {
    intent: "question",
    understanding: "Dúvida sobre VPN.",
    action: "Responder",
    confidence,
    rationale: "Pergunta simples.",
  },
});

describe("turno do agent (Postgres real, modelo roteirizado)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let gateway: FakeTicketGateway;
  let sid: string;
  let deps: TurnDeps;
  const session = () => ({ sid, userId: "ana.souza", name: "Ana Souza" });

  const build = (limits: { session?: number; daily?: number } = {}) =>
    createTurnDeps({
      db,
      gateway,
      modelId: "test/scripted",
      minConfidence: 0.6,
      sessionLimit: limits.session ?? 30,
      dailyLimit: limits.daily ?? 500,
    });

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    gateway = new FakeTicketGateway();
    await db.update(conversations).set({ state: "closed" }).where(eq(conversations.employeeId, "ana.souza"));
    await db.delete(decisionTraces);
    await db.delete(dailyUsage);
    const [row] = await db
      .insert(authSessions)
      .values({ userId: "ana.souza", expiresAt: new Date(Date.now() + 3_600_000) })
      .returning({ id: authSessions.id });
    sid = row?.id ?? "";
    deps = build();
    setScript([]);
  });

  async function run(text: string, steps: ScriptStep[], d: TurnDeps = deps) {
    setScript(steps);
    const result = await runTurn({ session: session(), text }, d);
    if (result.kind !== "stream") return { result, body: "" };
    return { result, body: await result.response.text() };
  }

  const current = () => new ConversationService(db).getOrCreateCurrent("ana.souza");
  const rowsOf = async (conversationId: string) =>
    db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  const usedOf = async () => (await db.select().from(authSessions).where(eq(authSessions.id, sid)))[0]?.messagesSent;
  const stateOf = async (id: string) =>
    (await db.select().from(conversations).where(eq(conversations.id, id)))[0]?.state;

  it("conversa em waiting_analyst: paused, grava a mensagem, 0 chamadas ao modelo e não consome a cota", async () => {
    const conv = await current();
    await new ConversationService(db).apply(conv.id, { type: "handoff", reason: "user_request", summary: "x" });
    const { result } = await run("alguém aí?", [{ text: "não deveria rodar" }]);
    expect(result).toEqual({ kind: "paused", state: "waiting_analyst" });
    expect(scriptedCallCount()).toBe(0);
    expect(await usedOf()).toBe(0);
    const rows = await rowsOf(conv.id);
    expect(rows.filter((r) => r.author === "employee").map((r) => r.content)).toEqual(["alguém aí?"]);
  });

  it("com 30 mensagens usadas: quota_exceeded, sem chamar o modelo e sem gastar o limite diário", async () => {
    await db.update(authSessions).set({ messagesSent: 30 }).where(eq(authSessions.id, sid));
    const { result } = await run("oi", [{ text: "x" }]);
    expect(result).toEqual({ kind: "quota_exceeded", used: 30, limit: 30 });
    expect(scriptedCallCount()).toBe(0);
    expect((await db.select().from(dailyUsage))[0]?.llmTurns ?? 0).toBe(0);
  });

  it("turno normal grava a mensagem do agent, o trace e incrementa daily_usage", async () => {
    const conv = await current();
    const { result, body } = await run("como configuro a VPN?", [
      { toolCalls: [{ name: "search_my_tickets", input: { scope: "open" } }, decision(0.9)] },
      { text: "Abra o cliente VPN e entre com seu usuário." },
    ]);
    expect(result.kind).toBe("stream");
    expect(body).toContain("Abra o cliente VPN");
    const rows = await rowsOf(conv.id);
    expect(rows.map((r) => r.author)).toEqual(["employee", "agent"]);
    const agent = rows[1];
    expect(agent?.content).toBe("Abra o cliente VPN e entre com seu usuário.");
    const [trace] = await db.select().from(decisionTraces).where(eq(decisionTraces.messageId, agent?.id ?? ""));
    expect(trace).toMatchObject({ intent: "question", model: "test/scripted" });
    expect(trace?.confidence).toBeCloseTo(0.9, 5);
    expect(JSON.stringify(trace?.tools)).toContain("consultou seus chamados");
    expect((await db.select().from(dailyUsage))[0]?.llmTurns).toBe(1);
    expect(await usedOf()).toBe(1);
    expect(await stateOf(conv.id)).toBe("agent");
  });

  it("record_decision com confiança 0.3 transfere: waiting_analyst, low_confidence e mensagem de sistema", async () => {
    const conv = await current();
    await run("hm", [{ toolCalls: [decision(0.3)] }, { text: "Vou chamar um analista." }]);
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(row).toMatchObject({ state: "waiting_analyst", handoffReason: "low_confidence" });
    const rows = await rowsOf(conv.id);
    expect(rows.some((r) => r.author === "system" && r.content === "Transferida para Suporte N2")).toBe(true);
  });

  it("limite diário: daily_limit sem consumir a cota da sessão", async () => {
    const small = build({ daily: 1 });
    await run("um", [{ toolCalls: [decision(0.9)] }, { text: "ok" }], small);
    const { result } = await run("dois", [{ text: "x" }], small);
    expect(result).toEqual({ kind: "daily_limit" });
    expect(await usedOf()).toBe(1);
    expect((await db.select().from(dailyUsage))[0]?.llmTurns).toBe(1);
  });

  it("falha do modelo: mensagem do funcionário fica, sem mensagem do agent nem trace, erro em pt-BR sem stack", async () => {
    const conv = await current();
    const { result, body } = await run("oi", [{ error: "falha interna com chave sk-secreta" }]);
    expect(result.kind).toBe("stream");
    expect(body).toContain("Não consegui");
    expect(body).not.toMatch(/falha interna|sk-secreta|node_modules/);
    expect((await rowsOf(conv.id)).map((r) => r.author)).toEqual(["employee"]);
    expect(await db.select().from(decisionTraces)).toHaveLength(0);
  });

  it("agent real do Mastra: o RequestContext é compartilhado e getRecordedDecision enxerga a decisão no onFinish", async () => {
    const agent = createNexoAgent({
      gateway,
      conversations: { apply: async () => undefined },
      drafts: {
        createDraft: async () => {
          throw new Error("não usado");
        },
      },
      searchArticles: async () => [],
      modelId: "test/scripted",
    });
    setScript([{ toolCalls: [decision(0.77)] }, { text: "pronto" }]);
    const requestContext = createNexoRequestContext({
      employeeId: "ana.souza",
      conversationId: "c1",
      sessionId: "s1",
      profile: { name: "Ana", department: "Financeiro", deviceOs: null },
    });
    let seen: ReturnType<typeof getRecordedDecision>;
    const output = await agent.stream([{ role: "user", content: "oi" }], {
      requestContext,
      onFinish: () => {
        seen = getRecordedDecision(requestContext);
      },
    });
    await output.consumeStream();
    expect(seen).toMatchObject({ intent: "question", confidence: 0.77 });
  });
});
