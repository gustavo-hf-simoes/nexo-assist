import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConversationService } from "../../src/server/conversations/conversation-service";
import { toUiMessage } from "../../src/server/conversations/ui-messages";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { conversations } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";
import { confirmDraft, draftErrorResponse } from "../../src/server/drafts/draft-actions";
import { DraftService } from "../../src/server/drafts/draft-service";
import type { DraftPayload } from "../../src/server/drafts/draft-types";
import { DraftNotFoundError, DraftNotPendingError } from "../../src/server/drafts/errors";
import { TicketServiceUnavailableError } from "../../src/server/tickets/ticket-errors";
import { FakeTicketGateway } from "../fakes/fake-ticket-gateway";

type Session = typeof import("../../src/server/auth/session");

describe("rotas do chat e ações de rascunho (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let session: Session;
  let gateway: FakeTicketGateway;
  let convs: ConversationService;
  let drafts: DraftService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);
    process.env.APP_DATABASE_URL = container.getConnectionUri();
    process.env.SESSION_SECRET = "r".repeat(40);
    process.env.TICKET_SERVICE_URL = "http://localhost:4010";
    process.env.TICKET_SERVICE_TOKEN = "token";
    process.env.NEXO_AGENT_MODEL = "test/scripted";
    session = await import("../../src/server/auth/session");
  });

  afterAll(async () => {
    await (await import("../../src/server/db/app-db")).closeDb();
    await pool.end();
    await container.stop();
  });

  beforeEach(() => {
    gateway = new FakeTicketGateway();
    convs = new ConversationService(db);
    drafts = new DraftService(db, gateway, convs);
  });

  const ana = { id: "ana.souza", name: "Ana Souza", email: "ana.souza@nexo.com.br", role: "employee" } as const;

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
    priorityReason: "Sem bloqueio.",
    dueAt: new Date().toISOString(),
    ...overrides,
  });

  async function freshDraft(overrides: Partial<DraftPayload> = {}) {
    await db.update(conversations).set({ state: "closed" }).where(eq(conversations.employeeId, "ana.souza"));
    const conv = await convs.getOrCreateCurrent("ana.souza");
    const draft = await drafts.createDraft({
      conversationId: conv.id,
      employeeId: "ana.souza",
      kind: "create",
      payload: payload(overrides),
    });
    return { conv, draft };
  }

  const deps = () => ({ drafts, conversations: convs, gateway });

  it("confirmDraft cria o chamado e grava a mensagem de sistema", async () => {
    const { conv, draft } = await freshDraft();
    const { ticket, handoff } = await confirmDraft(deps(), draft.id, "ana.souza");
    expect(handoff).toBeUndefined();
    const rows = await convs.listMessages(conv.id);
    const system = rows.filter((r) => r.author === "system");
    expect(system.map((r) => r.content)).toEqual([`Chamado ${ticket.code} criado`]);
    expect(gateway.transferCalls).toHaveLength(0);
  });

  it("chamado crítico enfileira no N2 e devolve handoff", async () => {
    const { draft } = await freshDraft({ priority: "critica", blocksWork: true, impact: "company" });
    const { ticket, handoff } = await confirmDraft(deps(), draft.id, "ana.souza");
    expect(handoff).toBe("critical");
    expect(gateway.transferCalls).toHaveLength(1);
    expect(gateway.transferCalls[0]?.code).toBe(ticket.code);
    expect(gateway.transferCalls[0]?.input.queue).toBe("N2");
    expect(gateway.transferCalls[0]?.idempotencyKey).toBe(`critical:${draft.id}`);
  });

  it("falha no transfer não desfaz a confirmação", async () => {
    const { draft } = await freshDraft({ priority: "critica", blocksWork: true, impact: "company" });
    gateway.transfer = async () => {
      throw new TicketServiceUnavailableError();
    };
    const result = await confirmDraft(deps(), draft.id, "ana.souza");
    expect(result.handoff).toBe("critical");
    expect(result.ticket.code).toMatch(/^INC-/);
  });

  it("confirmar duas vezes vira 409; rascunho alheio vira 404", async () => {
    const { draft } = await freshDraft();
    await confirmDraft(deps(), draft.id, "ana.souza");
    const second = await confirmDraft(deps(), draft.id, "ana.souza").catch((e: unknown) => e);
    expect(second).toBeInstanceOf(DraftNotPendingError);
    expect(draftErrorResponse(second)?.status).toBe(409);
    const other = await confirmDraft(deps(), draft.id, "carla.mendes").catch((e: unknown) => e);
    expect(other).toBeInstanceOf(DraftNotFoundError);
    expect(draftErrorResponse(other)?.status).toBe(404);
  });

  it("serviço de chamados fora do ar vira 503 em pt-BR", async () => {
    const { draft } = await freshDraft();
    gateway.unavailable = true;
    const error = await confirmDraft(deps(), draft.id, "ana.souza").catch((e: unknown) => e);
    const response = draftErrorResponse(error);
    expect(response?.status).toBe(503);
    expect(((await response?.json()) as { error: string }).error).toContain("indisponível");
    expect(draftErrorResponse(new Error("x"))).toBeUndefined();
  });

  it("toUiMessage usa parts guardadas, cai para texto e anexa trace só ao agent", async () => {
    const conv = await convs.getOrCreateCurrent("ana.souza");
    await convs.appendMessage(conv.id, { author: "employee", content: "oi" });
    const rows = await convs.listMessages(conv.id);
    const ui = toUiMessage(rows[rows.length - 1]!);
    expect(ui.role).toBe("user");
    expect(ui.parts).toEqual([{ type: "text", text: "oi" }]);
    expect(ui.trace).toBeUndefined();
    expect(typeof ui.createdAt).toBe("string");
  });

  describe("rotas HTTP", () => {
    const asRequest = (token: string | null, path: string, method: string, body?: unknown): Request =>
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(token ? { cookie: `nexo_session=${token}` } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

    it("toda rota exige sessão (401 sem cookie)", async () => {
      const chat = await import("../../src/app/api/chat/route");
      const current = await import("../../src/app/api/conversations/current/route");
      const confirm = await import("../../src/app/api/drafts/[id]/confirm/route");
      const cancel = await import("../../src/app/api/drafts/[id]/cancel/route");
      const params = { params: Promise.resolve({ id: "x" }) };
      expect((await chat.POST(asRequest(null, "/api/chat", "POST", { text: "oi" }))).status).toBe(401);
      expect((await current.GET(asRequest(null, "/api/conversations/current", "GET"))).status).toBe(401);
      expect((await confirm.POST(asRequest(null, "/api/drafts/x/confirm", "POST"), params)).status).toBe(401);
      expect((await cancel.POST(asRequest(null, "/api/drafts/x/cancel", "POST"), params)).status).toBe(401);
    });

    it("POST /api/chat valida o corpo: só { text }, não vazio, até 2000", async () => {
      const chat = await import("../../src/app/api/chat/route");
      const token = await session.createSession(ana, db);
      const post = (body: unknown) => chat.POST(asRequest(token, "/api/chat", "POST", body));
      expect((await post({ text: "   " })).status).toBe(400);
      expect((await post({ text: "a".repeat(2001) })).status).toBe(400);
      expect((await post({ text: "oi", messages: [] })).status).toBe(400);
      expect((await post({})).status).toBe(400);
    });

    it("GET /api/conversations/current devolve conversa, mensagens, quota e rascunhos", async () => {
      const current = await import("../../src/app/api/conversations/current/route");
      const token = await session.createSession(ana, db);
      const res = await current.GET(asRequest(token, "/api/conversations/current", "GET"));
      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        conversation: { state: string };
        messages: unknown[];
        quota: { used: number; limit: number };
        drafts: unknown[];
      };
      expect(json.conversation.state).toBe("agent");
      expect(Array.isArray(json.messages)).toBe(true);
      expect(json.quota.limit).toBe(30);
      expect(Array.isArray(json.drafts)).toBe(true);
    });

    it("cancel de rascunho alheio é 404 e confirm de rascunho inexistente é 404", async () => {
      const confirm = await import("../../src/app/api/drafts/[id]/confirm/route");
      const cancel = await import("../../src/app/api/drafts/[id]/cancel/route");
      const token = await session.createSession(ana, db);
      const missing = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) };
      expect((await confirm.POST(asRequest(token, "/x", "POST"), missing)).status).toBe(404);
      expect((await cancel.POST(asRequest(token, "/x", "POST"), missing)).status).toBe(404);
    });
  });
});
