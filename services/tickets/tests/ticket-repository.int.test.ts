import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { idempotencyKeys, ticketEvents, tickets } from "../src/db/schema";
import {
  IdempotencyKeyConflictError,
  ReopenWindowExpiredError,
  TicketNotFoundError,
} from "../src/errors";
import { seedTickets } from "../src/seed";
import { DrizzleTicketRepository } from "../src/ticket-repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-18T15:00:00.000Z");
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * DAY_MS);

const newTicket = {
  title: "Impressora do 3º andar sem toner",
  description: "A impressora não imprime desde manhã.",
  type: "INC",
  category: "Hardware",
  affected: "individual",
  blocksWork: false,
  sameDayDeadline: false,
  requesterId: "ana.souza",
} as const;

describe("TicketRepository (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let repo: DrizzleTicketRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    repo = new DrizzleTicketRepository(db);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await seedTickets(db, NOW);
  });

  describe("create", () => {
    it("é idempotente: a mesma chave devolve o mesmo código e cria só uma linha", async () => {
      const first = await repo.create(newTicket, "draft-1");
      const second = await repo.create(newTicket, "draft-1");

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.ticket.code).toBe(first.ticket.code);
      const rows = await db.select().from(tickets).where(eq(tickets.title, newTicket.title));
      expect(rows).toHaveLength(1);
      const keys = await db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, "draft-1"));
      expect(keys).toHaveLength(1);
    });

    it("recusa a mesma chave vinda de outro usuário, sem vazar o chamado", async () => {
      await repo.create(newTicket, "draft-shared");
      const attempt = repo.create({ ...newTicket, requesterId: "carla.mendes" }, "draft-shared");
      await expect(attempt).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
      const rows = await db.select().from(tickets).where(eq(tickets.title, newTicket.title));
      expect(rows.filter((r) => r.requesterId === "carla.mendes")).toHaveLength(0);
    });

    it("duas confirmações concorrentes geram no máximo um chamado", async () => {
      const results = await Promise.all([
        repo.create({ ...newTicket, title: "Concorrente" }, "draft-race"),
        repo.create({ ...newTicket, title: "Concorrente" }, "draft-race"),
      ]);
      expect(results[0].ticket.code).toBe(results[1].ticket.code);
      expect(results.filter((r) => r.replayed)).toHaveLength(1);
      const rows = await db.select().from(tickets).where(eq(tickets.title, "Concorrente"));
      expect(rows).toHaveLength(1);
    });

    it("calcula a prioridade no servidor e gera o código pela sequence", async () => {
      const { ticket } = await repo.create(
        { ...newTicket, blocksWork: true, title: "Bloqueado" },
        "draft-prio",
      );
      expect(ticket.priority).toBe("alta");
      expect(ticket.status).toBe("aberto");
      expect(ticket.code).toMatch(/^INC-\d+$/);
      expect(Number(ticket.code.slice(4))).toBeGreaterThanOrEqual(20520);

      const req = await repo.create({ ...newTicket, type: "REQ", title: "Pedido" }, "draft-req");
      expect(req.ticket.code).toMatch(/^REQ-\d+$/);
      expect(Number(req.ticket.code.slice(4))).toBeGreaterThanOrEqual(10450);
      expect(req.ticket.priority).toBe("baixa");
    });
  });

  describe("findByCode", () => {
    it("devolve o chamado ao dono", async () => {
      const ticket = await repo.findByCode("INC-20311", "ana.souza");
      expect(ticket?.title).toBe("Notebook lento após atualização do Windows");
      expect(ticket?.createdAt).toMatch(/Z$/);
    });

    it("devolve null para o chamado de outro usuário", async () => {
      expect(await repo.findByCode("INC-20311", "carla.mendes")).toBeNull();
    });

    it("devolve null para chamado inexistente", async () => {
      expect(await repo.findByCode("INC-99999", "ana.souza")).toBeNull();
    });
  });

  describe("listByRequester", () => {
    it("'open' não inclui resolvidos", async () => {
      const list = await repo.listByRequester("ana.souza", "open");
      const codes = list.map((t) => t.code);
      expect(codes).toContain("INC-20311");
      expect(codes).not.toContain("INC-20150");
      expect(list.every((t) => t.status !== "resolvido")).toBe(true);
    });

    it("'all' inclui resolvidos e só os do próprio usuário", async () => {
      const list = await repo.listByRequester("ana.souza", "all");
      expect(list.map((t) => t.code)).toEqual(expect.arrayContaining(["INC-20150", "INC-19877"]));
      expect(list.every((t) => t.requesterId === "ana.souza")).toBe(true);
    });
  });

  describe("reopen", () => {
    it("reabre chamado resolvido há 4 dias e registra um evento", async () => {
      const ticket = await repo.reopen("INC-20150", "ana.souza", NOW);
      expect(ticket.status).toBe("aberto");
      expect(ticket.resolvedAt).toBeNull();
      const events = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketCode, "INC-20150"));
      expect(events).toHaveLength(1);
      expect(events[0]?.kind).toBe("reopen");
    });

    it("repetir a reabertura com a mesma chave é um replay: um evento só, sem 409", async () => {
      await repo.reopen("INC-20150", "ana.souza", NOW, "r-1");
      const again = await repo.reopen("INC-20150", "ana.souza", NOW, "r-1");
      expect(again.status).toBe("aberto");
      const events = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketCode, "INC-20150"));
      expect(events).toHaveLength(1);
    });

    it("lança ReopenWindowExpiredError para resolvido há 8 dias", async () => {
      await db
        .update(tickets)
        .set({ resolvedAt: daysAgo(8) })
        .where(eq(tickets.code, "INC-20150"));
      await expect(repo.reopen("INC-20150", "ana.souza", NOW)).rejects.toBeInstanceOf(
        ReopenWindowExpiredError,
      );
    });

    it("não reabre chamado de outro usuário (não encontrado)", async () => {
      await expect(repo.reopen("INC-20150", "carla.mendes", NOW)).rejects.toBeInstanceOf(
        TicketNotFoundError,
      );
    });
  });

  describe("addComment", () => {
    it("grava o comentário uma única vez por chave", async () => {
      await repo.addComment("INC-20298", "ana.souza", "Ainda sem acesso.", "c-1");
      await repo.addComment("INC-20298", "ana.souza", "Ainda sem acesso.", "c-1");
      const events = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketCode, "INC-20298"));
      expect(events.filter((e) => e.kind === "comment")).toHaveLength(1);
    });

    it("responde não encontrado para chamado de outro usuário", async () => {
      await expect(repo.addComment("INC-20420", "ana.souza", "oi", "c-2")).rejects.toBeInstanceOf(
        TicketNotFoundError,
      );
    });
  });

  describe("transfer", () => {
    it("move para aguardando_analista e registra fila e resumo no evento", async () => {
      const input = { summary: "Sem resposta há 6 dias.", queue: "N2" } as const;
      const ticket = await repo.transfer("INC-20298", "ana.souza", input, "t-1");
      expect(ticket.status).toBe("aguardando_analista");
      const events = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketCode, "INC-20298"));
      const event = events.find((e) => e.kind === "transfer");
      expect(event?.body).toBe(input.summary);
      expect(event?.metadata).toEqual({ queue: "N2" });

      await repo.transfer("INC-20298", "ana.souza", input, "t-1");
      const again = await db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketCode, "INC-20298"));
      expect(again.filter((e) => e.kind === "transfer")).toHaveLength(1);
    });

    it("responde não encontrado para chamado de outro usuário", async () => {
      await expect(
        repo.transfer("INC-20420", "ana.souza", { summary: "x", queue: "N1" }, "t-2"),
      ).rejects.toBeInstanceOf(TicketNotFoundError);
    });
  });

  describe("seed", () => {
    it("é idempotente e relativa a now", async () => {
      await seedTickets(db, NOW);
      await seedTickets(db, NOW);
      const all = await db.select().from(tickets);
      expect(all.filter((t) => t.code === "INC-20311")).toHaveLength(1);
      const t = await repo.findByCode("INC-20311", "ana.souza");
      expect(t?.lastSupportUpdateAt).toBe(daysAgo(6).toISOString());
      const old = await repo.findByCode("INC-19877", "ana.souza");
      expect(old?.resolvedAt).toBe(daysAgo(20).toISOString());
    });
  });
});
