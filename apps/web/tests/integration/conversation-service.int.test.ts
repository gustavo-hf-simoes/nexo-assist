import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConversationService } from "../../src/server/conversations/conversation-service";
import { InvalidTransitionError, QuotaExceededError } from "../../src/server/conversations/errors";
import { MessageQuota, MESSAGE_LIMIT } from "../../src/server/conversations/message-quota";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { authSessions, conversations, messages } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";

describe("conversas e cota (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let service: ConversationService;
  let quota: MessageQuota;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);
    service = new ConversationService(db);
    quota = new MessageQuota(db);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  const newSession = async (): Promise<string> => {
    const [row] = await db
      .insert(authSessions)
      .values({ userId: "ana.souza", expiresAt: new Date(Date.now() + 3_600_000) })
      .returning({ id: authSessions.id });
    return row?.id ?? "";
  };

  it("getOrCreateCurrent reaproveita a conversa aberta e cria outra depois de closed", async () => {
    const first = await service.getOrCreateCurrent("ana.souza");
    expect((await service.getOrCreateCurrent("ana.souza")).id).toBe(first.id);
    await service.apply(first.id, { type: "close" });
    const second = await service.getOrCreateCurrent("ana.souza");
    expect(second.id).not.toBe(first.id);
    expect(second.state).toBe("agent");
  });

  it("apply grava a mensagem de sistema e os campos do handoff/assume", async () => {
    const conv = await service.getOrCreateCurrent("carla.mendes");
    await service.apply(conv.id, { type: "handoff", reason: "critical", summary: "VPN fora" });
    await service.apply(conv.id, { type: "assume", analystId: "rafael.lima" });
    const [row] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    expect(row).toMatchObject({
      state: "analyst",
      handoffReason: "critical",
      handoffSummary: "VPN fora",
      assignedAnalystId: "rafael.lima",
    });
    const system = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
    const texts = system.filter((m) => m.author === "system").map((m) => m.content);
    expect(texts).toContain("Transferida para Suporte N2");
    expect(texts).toContain("Rafael Lima assumiu a conversa");
  });

  it("handoff por pedido do usuário anuncia a fila N1", async () => {
    const conv = await service.getOrCreateCurrent("fabio.nunes");
    await service.apply(conv.id, { type: "handoff", reason: "user_request", summary: "Quer falar" });
    const rows = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
    expect(rows.filter((m) => m.author === "system").map((m) => m.content)).toEqual(["Transferida para Suporte N1"]);
  });

  it("dois assume concorrentes: um vence e o outro lança", async () => {
    const conv = await service.getOrCreateCurrent("diego.ramos");
    await service.apply(conv.id, { type: "handoff", reason: "user_request", summary: "x" });
    const results = await Promise.allSettled([
      service.apply(conv.id, { type: "assume", analystId: "rafael.lima" }),
      service.apply(conv.id, { type: "assume", analystId: "rafael.lima" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(InvalidTransitionError);
    const assumed = (await db.select().from(messages).where(eq(messages.conversationId, conv.id))).filter(
      (m) => m.content.includes("assumiu"),
    );
    expect(assumed).toHaveLength(1);
  });

  it("history: papéis, prefixo do analista, sem system, ordem e limite", async () => {
    const conv = await service.getOrCreateCurrent("elisa.prado");
    await service.appendMessage(conv.id, { author: "employee", authorId: "elisa.prado", content: "oi" });
    await service.appendMessage(conv.id, { author: "agent", content: "olá" });
    await service.apply(conv.id, { type: "handoff", reason: "user_request", summary: "x" });
    await service.apply(conv.id, { type: "assume", analystId: "rafael.lima" });
    await service.appendMessage(conv.id, { author: "analyst", authorId: "rafael.lima", content: "vou ver" });
    expect(await service.history(conv.id)).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
      { role: "assistant", content: "[Analista Rafael Lima] vou ver" },
    ]);
    expect(await service.history(conv.id, 2)).toEqual([
      { role: "assistant", content: "olá" },
      { role: "assistant", content: "[Analista Rafael Lima] vou ver" },
    ]);
  });

  it("cota: a 31ª chamada lança e uma sessão nova recomeça em 1", async () => {
    const sid = await newSession();
    for (let i = 1; i <= MESSAGE_LIMIT; i++) {
      expect(await quota.consume(sid)).toEqual({ used: i, limit: MESSAGE_LIMIT });
    }
    await expect(quota.consume(sid)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(await quota.peek(sid)).toEqual({ used: MESSAGE_LIMIT, limit: MESSAGE_LIMIT });
    expect(await quota.consume(await newSession())).toEqual({ used: 1, limit: MESSAGE_LIMIT });
  });

  it("cota: chamadas concorrentes nunca passam do limite", async () => {
    const sid = await newSession();
    const results = await Promise.allSettled(Array.from({ length: 40 }, () => quota.consume(sid)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(MESSAGE_LIMIT);
    expect((await quota.peek(sid)).used).toBe(MESSAGE_LIMIT);
  });
});
