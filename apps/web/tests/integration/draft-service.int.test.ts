import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConversationService } from "../../src/server/conversations/conversation-service";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { conversations, ticketDrafts } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";
import { DraftService } from "../../src/server/drafts/draft-service";
import type { DraftPayload, NewDraftInput } from "../../src/server/drafts/draft-types";
import { DraftNotFoundError, DraftNotPendingError } from "../../src/server/drafts/errors";
import { TicketConflictError, TicketServiceUnavailableError } from "../../src/server/tickets/ticket-errors";
import { FakeTicketGateway } from "../fakes/fake-ticket-gateway";

describe("rascunhos de chamado (Postgres real, gateway falso)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let conversationService: ConversationService;
  let gateway: FakeTicketGateway;
  let service: DraftService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);
    conversationService = new ConversationService(db);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(() => {
    gateway = new FakeTicketGateway();
    service = new DraftService(db, gateway, conversationService);
  });

  const payload = (overrides: Partial<DraftPayload> = {}): DraftPayload => ({
    title: "Notebook muito lento",
    description: "Trava ao abrir o Excel.",
    type: "INC",
    category: "Hardware",
    impact: "individual",
    blocksWork: false,
    sameDayDeadline: false,
    affectedLabel: "Só você",
    priority: "media",
    priorityReason: "Problema sem bloqueio e sem prazo no mesmo dia.",
    dueAt: new Date().toISOString(),
    ...overrides,
  });

  async function newConversation(employeeId: string): Promise<string> {
    // Só pode haver uma conversa aberta por funcionário (índice único parcial).
    await db.update(conversations).set({ state: "closed" }).where(eq(conversations.employeeId, employeeId));
    const [row] = await db.insert(conversations).values({ employeeId }).returning({ id: conversations.id });
    return row?.id ?? "";
  }

  async function newDraft(overrides: Partial<NewDraftInput> & { payloadOverrides?: Partial<DraftPayload> } = {}) {
    const { payloadOverrides, ...rest } = overrides;
    const conversationId = rest.conversationId ?? (await newConversation("ana.souza"));
    return service.createDraft({
      employeeId: "ana.souza",
      kind: "create",
      payload: payload(payloadOverrides),
      ...rest,
      conversationId,
    });
  }

  it("gera displayCode D-<número> único e crescente", async () => {
    const a = await newDraft();
    const b = await newDraft();
    expect(a.displayCode).toMatch(/^D-\d+$/);
    expect(Number(b.displayCode.slice(2))).toBe(Number(a.displayCode.slice(2)) + 1);
    expect(a.status).toBe("pending");
  });

  it("displayCodes simultâneos não colidem", async () => {
    const conversationId = await newConversation("ana.souza");
    const drafts = await Promise.all(Array.from({ length: 6 }, () => newDraft({ conversationId })));
    expect(new Set(drafts.map((d) => d.displayCode)).size).toBe(6);
  });

  it("rascunho novo na mesma conversa marca os pending anteriores como superseded", async () => {
    const conversationId = await newConversation("ana.souza");
    const first = await newDraft({ conversationId });
    const second = await newDraft({ conversationId });
    const rows = await db.select().from(ticketDrafts).where(eq(ticketDrafts.conversationId, conversationId));
    expect(rows.find((r) => r.id === first.id)?.status).toBe("superseded");
    expect(rows.find((r) => r.id === second.id)?.status).toBe("pending");
    await expect(service.confirm(first.id, "ana.souza")).rejects.toBeInstanceOf(DraftNotPendingError);
  });

  it("dois confirm concorrentes: um cria e o outro lança DraftNotPendingError", async () => {
    gateway.createDelayMs = 50;
    const draft = await newDraft();
    const results = await Promise.allSettled([
      service.confirm(draft.id, "ana.souza"),
      service.confirm(draft.id, "ana.souza"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(DraftNotPendingError);
    expect(gateway.createCalls).toHaveLength(1);
    expect(gateway.createCalls[0]?.idempotencyKey).toBe(draft.id);
  });

  it("confirmar de novo um rascunho confirmado lança DraftNotPendingError", async () => {
    const draft = await newDraft();
    const { ticket } = await service.confirm(draft.id, "ana.souza");
    expect(ticket.requesterId).toBe("ana.souza");
    const [row] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, draft.id));
    expect(row).toMatchObject({ status: "confirmed", ticketCode: ticket.code });
    await expect(service.confirm(draft.id, "ana.souza")).rejects.toBeInstanceOf(DraftNotPendingError);
  });

  it("rascunho cancelado não pode ser confirmado", async () => {
    const draft = await newDraft();
    await service.cancel(draft.id, "ana.souza");
    await expect(service.confirm(draft.id, "ana.souza")).rejects.toBeInstanceOf(DraftNotPendingError);
    await expect(service.cancel(draft.id, "ana.souza")).rejects.toBeInstanceOf(DraftNotPendingError);
    expect(gateway.createCalls).toHaveLength(0);
  });

  it("rascunho de outro funcionário responde not found, sem chamar o gateway", async () => {
    const draft = await newDraft();
    await expect(service.confirm(draft.id, "carla.mendes")).rejects.toBeInstanceOf(DraftNotFoundError);
    await expect(service.cancel(draft.id, "carla.mendes")).rejects.toBeInstanceOf(DraftNotFoundError);
    await expect(
      service.confirm("00000000-0000-4000-8000-0000000000ff", "ana.souza"),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
    expect(gateway.createCalls).toHaveLength(0);
    const [row] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, draft.id));
    expect(row?.status).toBe("pending");
  });

  it("serviço indisponível devolve o rascunho a pending e o próximo confirm reusa a idempotencyKey", async () => {
    const draft = await newDraft();
    gateway.unavailable = true;
    await expect(service.confirm(draft.id, "ana.souza")).rejects.toBeInstanceOf(TicketServiceUnavailableError);
    const [row] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, draft.id));
    expect(row?.status).toBe("pending");

    gateway.unavailable = false;
    const { ticket } = await service.confirm(draft.id, "ana.souza");
    expect(ticket.code).toMatch(/^INC-/);
    expect(gateway.createCalls.map((c) => c.idempotencyKey)).toEqual([draft.id, draft.id]);
  });

  it("rascunho preso em confirming (crash) é retomado com a mesma chave e não duplica o chamado", async () => {
    const draft = await newDraft();
    // O envio chegou ao serviço, mas o processo morreu antes de finishConfirming.
    const first = await gateway.create(
      "ana.souza",
      { title: payload().title, description: payload().description, type: "INC", category: "Hardware", affected: "individual", blocksWork: false, sameDayDeadline: false },
      draft.id,
    );
    const longAgo = new Date(Date.now() - 5 * 60_000);
    await db.update(ticketDrafts).set({ status: "confirming", confirmingSince: longAgo }).where(eq(ticketDrafts.id, draft.id));

    const { ticket } = await service.confirm(draft.id, "ana.souza");
    expect(ticket.code).toBe(first.code);
    expect(gateway.tickets.filter((t) => t.title === payload().title)).toHaveLength(1);
    expect(gateway.createCalls.map((c) => c.idempotencyKey)).toEqual([draft.id, draft.id]);
    const [row] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, draft.id));
    expect(row).toMatchObject({ status: "confirmed", ticketCode: first.code });
  });

  it("confirming recente (envio em andamento) não é retomado: DraftNotPendingError", async () => {
    const draft = await newDraft();
    await db.update(ticketDrafts).set({ status: "confirming", confirmingSince: new Date() }).where(eq(ticketDrafts.id, draft.id));
    await expect(service.confirm(draft.id, "ana.souza")).rejects.toBeInstanceOf(DraftNotPendingError);
    await expect(service.confirm(draft.id, "carla.mendes")).rejects.toBeInstanceOf(DraftNotFoundError);
  });

  it("outro erro do gateway marca o rascunho como failed", async () => {
    const draft = await newDraft();
    gateway.failCreateWith = new Error("boom");
    await expect(service.confirm(draft.id, "ana.souza")).rejects.toThrow("boom");
    const [row] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, draft.id));
    expect(row?.status).toBe("failed");
  });

  it("conflito do serviço de chamados propaga o erro e deixa o rascunho failed", async () => {
    const draft = await newDraft();
    gateway.failCreateWith = new TicketConflictError("reopen_window_expired");
    await expect(service.confirm(draft.id, "ana.souza")).rejects.toBeInstanceOf(TicketConflictError);
    const [row] = await db.select().from(ticketDrafts).where(eq(ticketDrafts.id, draft.id));
    expect(row?.status).toBe("failed");
  });

  it("chamado criado com prioridade crítica devolve handoff critical e a conversa vai para waiting_analyst", async () => {
    const conversationId = await newConversation("ana.souza");
    const draft = await newDraft({
      conversationId,
      payloadOverrides: { impact: "team", blocksWork: true, priority: "critica", title: "Sistema fora do ar" },
    });
    const result = await service.confirm(draft.id, "ana.souza");
    expect(result.ticket.priority).toBe("critica");
    expect(result.handoff).toBe("critical");
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    expect(conv).toMatchObject({ state: "waiting_analyst", handoffReason: "critical" });
  });

  it("chamado não crítico não faz handoff", async () => {
    const draft = await newDraft();
    const result = await service.confirm(draft.id, "ana.souza");
    expect(result.handoff).toBeUndefined();
  });

  it("update vira comentário e reopen vira reabertura, devolvendo o TicketDto do gateway", async () => {
    const update = await newDraft({ kind: "update", targetTicketCode: "INC-20311" });
    const updated = await service.confirm(update.id, "ana.souza");
    expect(updated.ticket.code).toBe("INC-20311");
    expect(gateway.commentCalls[0]).toMatchObject({ code: "INC-20311", body: "Trava ao abrir o Excel." });

    const reopen = await newDraft({ kind: "reopen", targetTicketCode: "INC-20150" });
    const reopened = await service.confirm(reopen.id, "ana.souza");
    expect(reopened.ticket).toMatchObject({ code: "INC-20150", status: "aberto" });
    expect(gateway.reopenCalls).toEqual([{ employeeId: "ana.souza", code: "INC-20150" }]);
    expect(gateway.createCalls).toHaveLength(0);
  });
});
