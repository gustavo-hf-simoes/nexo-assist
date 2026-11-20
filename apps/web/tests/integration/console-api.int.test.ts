import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { conversations, decisionTraces, messages } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";
import { FakeTicketGateway } from "../fakes/fake-ticket-gateway";

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Promise<Response>;
type Json = Record<string, unknown>;
type ListBody = {
  conversations: Array<{ id: string; state: string; lastMessagePreview: string; unreadForAnalyst: number; employee: Json; badge: { tone: string; text: string } }>;
  counts: Record<string, number>;
};

const ANA_CONV = "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0a0001";
const CARLA_CONV = "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0a0002";

describe("API do console do analista (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let list: typeof import("../../src/app/api/console/conversations/route");
  let detail: typeof import("../../src/app/api/console/conversations/[id]/route");
  let assume: typeof import("../../src/app/api/console/conversations/[id]/assume/route");
  let giveBack: typeof import("../../src/app/api/console/conversations/[id]/return/route");
  let close: typeof import("../../src/app/api/console/conversations/[id]/close/route");
  let post: typeof import("../../src/app/api/console/conversations/[id]/messages/route");
  let queries: typeof import("../../src/server/conversations/console-queries");
  let ConversationServiceCtor: typeof import("../../src/server/conversations/conversation-service").ConversationService;
  let model: typeof import("../../src/server/agent/model");
  let runTurnModule: typeof import("../../src/server/agent/run-turn");
  let tokens: { rafael: string; julia: string; ana: string };
  let anaSid = "";

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);
    process.env.APP_DATABASE_URL = container.getConnectionUri();
    process.env.SESSION_SECRET = "c".repeat(40);
    process.env.TICKET_SERVICE_URL = "http://127.0.0.1:1";
    process.env.TICKET_SERVICE_TOKEN = "token";
    process.env.NEXO_AGENT_MODEL = "test/scripted";
    list = await import("../../src/app/api/console/conversations/route");
    detail = await import("../../src/app/api/console/conversations/[id]/route");
    assume = await import("../../src/app/api/console/conversations/[id]/assume/route");
    giveBack = await import("../../src/app/api/console/conversations/[id]/return/route");
    close = await import("../../src/app/api/console/conversations/[id]/close/route");
    post = await import("../../src/app/api/console/conversations/[id]/messages/route");
    queries = await import("../../src/server/conversations/console-queries");
    ({ ConversationService: ConversationServiceCtor } = await import("../../src/server/conversations/conversation-service"));
    model = await import("../../src/server/agent/model");
    runTurnModule = await import("../../src/server/agent/run-turn");
    const session = await import("../../src/server/auth/session");
    const mk = (id: string, name: string, role: "employee" | "analyst") =>
      session.createSession({ id, name, email: `${id}@nexo.com.br`, role }, db);
    tokens = {
      rafael: await mk("rafael.lima", "Rafael Lima", "analyst"),
      julia: await mk("julia.castro", "Júlia Castro", "analyst"),
      ana: await mk("ana.souza", "Ana Souza", "employee"),
    };
    anaSid = (await session.readSession(tokens.ana))?.sid ?? "";
  });

  afterAll(async () => {
    await (await import("../../src/server/db/app-db")).closeDb();
    await pool.end();
    await container.stop();
  });

  // Cada teste parte do seed: apaga o que o teste anterior mudou e recria as conversas de demonstração.
  beforeEach(async () => {
    await db.delete(decisionTraces);
    await db.delete(messages);
    await db.delete(conversations);
    await seedApp(db);
  });

  const call = (handler: Handler, token: string, id: string, opts: { method?: string; body?: unknown } = {}) =>
    handler(
      new Request(`http://localhost/api/console/conversations/${id}`, {
        method: opts.method ?? "POST",
        headers: { cookie: `nexo_session=${token}`, "content-type": "application/json" },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      }),
      { params: Promise.resolve({ id }) },
    );

  const listAs = async (token: string, query = ""): Promise<ListBody> => {
    const res = await list.GET(new Request(`http://localhost/api/console/conversations${query}`, { headers: { cookie: `nexo_session=${token}` } }));
    expect(res.status).toBe(200);
    return (await res.json()) as ListBody;
  };

  const rowOf = async (id: string) => (await db.select().from(conversations).where(eq(conversations.id, id)))[0];

  it("for_you lista só waiting_analyst, da mais antiga para a mais nova", async () => {
    const recent = await new ConversationServiceCtor(db).getOrCreateCurrent("bruno.tavares");
    await db.update(conversations).set({ state: "waiting_analyst", updatedAt: new Date() }).where(eq(conversations.id, recent.id));
    const body = await listAs(tokens.rafael, "?filter=for_you");
    expect(body.conversations.map((c) => c.id)).toEqual([ANA_CONV, recent.id]);
    expect(body.conversations.every((c) => c.state === "waiting_analyst")).toBe(true);
    expect(body.counts).toMatchObject({ for_you: 2, with_agent: 1, mine: 0 });
    expect(body.counts["all"]).toBeGreaterThanOrEqual(4);
  });

  it("resumo traz funcionário, selo do chamado vinculado e não lidas", async () => {
    const [ana] = (await listAs(tokens.rafael, "?filter=for_you")).conversations;
    expect(ana).toMatchObject({
      id: ANA_CONV,
      employee: { id: "ana.souza", name: "Ana Souza", initials: "AS", department: "Financeiro" },
      badge: { tone: "danger", text: "Transferida · INC-20311" },
      unreadForAnalyst: 1,
    });
    expect(ana?.lastMessagePreview).toContain("INC-20311");
  });

  it("selo 'Agent pediu ajuda' usa a confiança do último trace de baixa confiança", async () => {
    const inserted = await db
      .insert(messages)
      .values({ conversationId: CARLA_CONV, author: "agent", content: "Vou chamar um analista." })
      .returning({ id: messages.id });
    await db.insert(decisionTraces).values({
      messageId: inserted[0]?.id ?? "",
      intent: "question",
      understanding: "u",
      action: "a",
      confidence: 0.41,
      rationale: "r",
      tools: [],
      model: "m",
      latencyMs: 1,
    });
    await db.update(conversations).set({ state: "waiting_analyst", handoffReason: "low_confidence" }).where(eq(conversations.id, CARLA_CONV));
    const carla = (await listAs(tokens.rafael, "?filter=for_you")).conversations.find((c) => c.id === CARLA_CONV);
    expect(carla?.badge).toEqual({ tone: "warning", text: "Agent pediu ajuda · confiança 41%" });
  });

  it("busca por nome e por conteúdo, com curingas escapados", async () => {
    expect((await listAs(tokens.rafael, "?q=ana")).conversations.map((c) => c.id)).toEqual([ANA_CONV]);
    expect((await listAs(tokens.rafael, "?q=Outlook")).conversations.map((c) => c.id)).toEqual([CARLA_CONV]);
    expect((await listAs(tokens.rafael, "?q=%25")).conversations).toHaveLength(0);
    expect((await listAs(tokens.rafael, "?q=_")).conversations).toHaveLength(0);
  });

  it("filtro inválido vira 400", async () => {
    const res = await list.GET(new Request("http://localhost/api/console/conversations?filter=x", { headers: { cookie: `nexo_session=${tokens.rafael}` } }));
    expect(res.status).toBe(400);
  });

  it("assume muda para analyst com assigned_analyst_id; o segundo analista leva 409", async () => {
    expect((await call(assume.POST, tokens.rafael, ANA_CONV)).status).toBe(200);
    expect(await rowOf(ANA_CONV)).toMatchObject({ state: "analyst", assignedAnalystId: "rafael.lima" });
    expect((await call(assume.POST, tokens.julia, ANA_CONV)).status).toBe(409);
    expect((await rowOf(ANA_CONV))?.assignedAnalystId).toBe("rafael.lima");
    const mine = await listAs(tokens.rafael, "?filter=mine");
    expect(mine.conversations.map((c) => c.id)).toEqual([ANA_CONV]);
    expect(mine.conversations[0]?.badge.text).toBe("Em atendimento · Rafael Lima");
    expect((await listAs(tokens.julia, "?filter=mine")).conversations).toHaveLength(0);
  });

  it("conversa inexistente ou id inválido vira 404", async () => {
    expect((await call(assume.POST, tokens.rafael, "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0affff")).status).toBe(404);
    expect((await call(detail.GET, tokens.rafael, "nao-e-uuid", { method: "GET" })).status).toBe(404);
  });

  it("mensagem do analista: 409 sem assumir, 403 em conversa de outro, 201 e aparece no histórico do funcionário", async () => {
    const body = { text: "Oi Ana, já estou olhando." };
    expect((await call(post.POST, tokens.rafael, ANA_CONV, { body })).status).toBe(409);
    await call(assume.POST, tokens.rafael, ANA_CONV);
    expect((await call(post.POST, tokens.julia, ANA_CONV, { body })).status).toBe(403);
    expect((await call(post.POST, tokens.rafael, ANA_CONV, { body: { text: "   " } })).status).toBe(400);
    expect((await call(post.POST, tokens.rafael, ANA_CONV, { body })).status).toBe(201);

    const service = new ConversationServiceCtor(db);
    const analyst = (await service.listMessages(ANA_CONV)).filter((r) => r.author === "analyst");
    expect(analyst).toHaveLength(1);
    expect(analyst[0]).toMatchObject({ content: body.text, authorName: "Rafael Lima" });
    expect((await service.history(ANA_CONV)).at(-1)).toEqual({ role: "assistant", content: `[Analista Rafael Lima] ${body.text}` });
  });

  it("return volta para agent e o próximo turno do funcionário chama o modelo", async () => {
    model.setScript([{ text: "Posso ajudar com mais alguma coisa?" }]);
    const deps = runTurnModule.createTurnDeps({ db, gateway: new FakeTicketGateway(), modelId: "test/scripted", minConfidence: 0.6, sessionLimit: 30, dailyLimit: 500 });
    const session = { sid: anaSid, userId: "ana.souza", name: "Ana Souza" };

    const paused = await runTurnModule.runTurn({ session, text: "Alguém aí?" }, deps);
    expect(paused.kind).toBe("paused");
    expect(model.scriptedCallCount()).toBe(0);

    await call(assume.POST, tokens.rafael, ANA_CONV);
    expect((await call(giveBack.POST, tokens.rafael, ANA_CONV)).status).toBe(200);
    expect((await rowOf(ANA_CONV))?.state).toBe("agent");
    expect((await call(post.POST, tokens.rafael, ANA_CONV, { body: { text: "ainda aqui" } })).status).toBe(409);

    const turn = await runTurnModule.runTurn({ session, text: "Voltou?" }, deps);
    expect(turn.kind).toBe("stream");
    if (turn.kind === "stream") await turn.response.text();
    expect(model.scriptedCallCount()).toBeGreaterThan(0);
  });

  it("return sem assumir é permitido; em conversa de outro analista, return e close levam 403", async () => {
    expect((await call(giveBack.POST, tokens.rafael, ANA_CONV)).status).toBe(200);
    await db.update(conversations).set({ state: "analyst", assignedAnalystId: "rafael.lima" }).where(eq(conversations.id, ANA_CONV));
    expect((await call(giveBack.POST, tokens.julia, ANA_CONV)).status).toBe(403);
    expect((await call(close.POST, tokens.julia, ANA_CONV)).status).toBe(403);
  });

  describe("posse na transição (regra: analyst = só o responsável; waiting_analyst = qualquer um; agent = pode encerrar)", () => {
    const setState = (id: string, state: "agent" | "waiting_analyst" | "analyst" | "closed", assigned: string | null) =>
      db.update(conversations).set({ state, assignedAnalystId: assigned }).where(eq(conversations.id, id));

    it("analyst: o responsável devolve e encerra; outro analista leva 403 e nada muda", async () => {
      await setState(ANA_CONV, "analyst", "rafael.lima");
      expect((await call(giveBack.POST, tokens.julia, ANA_CONV)).status).toBe(403);
      expect((await call(close.POST, tokens.julia, ANA_CONV)).status).toBe(403);
      expect(await rowOf(ANA_CONV)).toMatchObject({ state: "analyst", assignedAnalystId: "rafael.lima" });
      expect((await call(close.POST, tokens.rafael, ANA_CONV)).status).toBe(200);
    });

    it("waiting_analyst: qualquer analista devolve ou encerra", async () => {
      expect((await call(close.POST, tokens.julia, ANA_CONV)).status).toBe(200);
      await setState(ANA_CONV, "waiting_analyst", null);
      expect((await call(giveBack.POST, tokens.julia, ANA_CONV)).status).toBe(200);
      expect((await rowOf(ANA_CONV))?.state).toBe("agent");
    });

    it("agent: o console pode encerrar; devolver vira 409", async () => {
      expect((await call(giveBack.POST, tokens.julia, CARLA_CONV)).status).toBe(409);
      expect((await call(close.POST, tokens.julia, CARLA_CONV)).status).toBe(200);
      expect((await rowOf(CARLA_CONV))?.state).toBe("closed");
    });

    it("agent: qualquer analista assume sem transferência; o segundo leva 409", async () => {
      expect((await call(assume.POST, tokens.julia, CARLA_CONV)).status).toBe(200);
      expect(await rowOf(CARLA_CONV)).toMatchObject({ state: "analyst", assignedAnalystId: "julia.castro" });
      expect((await call(assume.POST, tokens.rafael, CARLA_CONV)).status).toBe(409);
    });

    // Reproduz a janela: a linha fica travada por outra transação; a chamada da Júlia espera no lock enquanto o
    // Rafael assume (e commita). Quando a da Júlia prossegue, enxerga o estado novo e é recusada.
    async function interleaved(run: Handler) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT 1 FROM conversations WHERE id = $1 FOR UPDATE", [ANA_CONV]);
        const pending = call(run, tokens.julia, ANA_CONV);
        for (let i = 0; i < 100; i++) {
          const waiting = await client.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock'");
          if (waiting.rowCount) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        await client.query("UPDATE conversations SET state = 'analyst', assigned_analyst_id = 'rafael.lima' WHERE id = $1", [ANA_CONV]);
        await client.query("COMMIT");
        return await pending;
      } finally {
        client.release();
      }
    }

    it("o Rafael assume entre a leitura e a transição: return da Júlia é recusado (403)", async () => {
      expect((await interleaved(giveBack.POST)).status).toBe(403);
      expect(await rowOf(ANA_CONV)).toMatchObject({ state: "analyst", assignedAnalystId: "rafael.lima" });
    });

    it("o Rafael assume entre a leitura e a transição: close da Júlia é recusado (403)", async () => {
      expect((await interleaved(close.POST)).status).toBe(403);
      expect(await rowOf(ANA_CONV)).toMatchObject({ state: "analyst", assignedAnalystId: "rafael.lima" });
    });
  });

  it("close muda para closed e grava a mensagem de sistema; fechar de novo vira 409", async () => {
    await call(assume.POST, tokens.rafael, ANA_CONV);
    expect((await call(close.POST, tokens.rafael, ANA_CONV)).status).toBe(200);
    expect((await rowOf(ANA_CONV))?.state).toBe("closed");
    const rows = await new ConversationServiceCtor(db).listMessages(ANA_CONV);
    expect(rows.at(-1)).toMatchObject({ author: "system", content: "Conversa encerrada" });
    expect((await call(close.POST, tokens.rafael, ANA_CONV)).status).toBe(409);
  });

  it("detalhe traz mensagens, resumo e trace da transferência, e mensagem pt-BR quando o serviço de chamados cai", async () => {
    const res = await call(detail.GET, tokens.rafael, ANA_CONV, { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversation: Json;
      employee: Json;
      handoff: { summary: string; linkedTicketCode: string; trace: Json | null };
      messages: unknown[];
      tickets: unknown;
      ticketsError: string;
    };
    expect(body.conversation).toMatchObject({ id: ANA_CONV, state: "waiting_analyst", assignedAnalystId: null });
    expect(body.employee).toMatchObject({ id: "ana.souza", name: "Ana Souza", department: "Financeiro" });
    expect(body.handoff.summary).toContain("INC-20311");
    expect(body.handoff.linkedTicketCode).toBe("INC-20311");
    expect(body.handoff.trace).toMatchObject({ understanding: expect.any(String) });
    expect(body.messages.length).toBeGreaterThanOrEqual(3);
    expect(body.tickets).toBeNull();
    expect(body.ticketsError).toBe("Não consegui carregar os chamados agora. O serviço de chamados está indisponível.");
  });

  it("loadConsoleDetail devolve os chamados do funcionário quando o serviço responde", async () => {
    const result = await queries.loadConsoleDetail(db, new FakeTicketGateway(), ANA_CONV);
    expect(result?.tickets?.map((t) => t.code)).toContain("INC-20311");
    expect(result?.ticketsError).toBeNull();
  });

  it("funcionário em qualquer rota do console leva 403; sem cookie, 401", async () => {
    expect((await list.GET(new Request("http://localhost/api/console/conversations", { headers: { cookie: `nexo_session=${tokens.ana}` } }))).status).toBe(403);
    for (const handler of [assume.POST, giveBack.POST, close.POST, post.POST]) {
      expect((await call(handler, tokens.ana, ANA_CONV, { body: { text: "oi" } })).status).toBe(403);
    }
    expect((await call(detail.GET, tokens.ana, ANA_CONV, { method: "GET" })).status).toBe(403);
    expect((await list.GET(new Request("http://localhost/api/console/conversations"))).status).toBe(401);
  });
});
