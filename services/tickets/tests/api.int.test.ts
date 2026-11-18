import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Hono } from "hono";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { createFaultInjector } from "../src/fault-injection";
import { seedTickets } from "../src/seed";
import { DrizzleTicketRepository } from "../src/ticket-repository";

const TOKEN = "token-de-teste";
const NOW = new Date("2026-11-18T15:00:00.000Z");
const auth = { Authorization: `Bearer ${TOKEN}` };
const json = { ...auth, "Content-Type": "application/json" };

const draft = {
  title: "Impressora do 3º andar sem toner",
  description: "A impressora não imprime desde manhã.",
  type: "INC",
  category: "Hardware",
  affected: "individual",
  blocksWork: false,
  sameDayDeadline: false,
};

describe("API HTTP de chamados (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let app: Hono;
  let seed: () => Promise<void>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    const created = createDb(container.getConnectionUri());
    pool = created.pool;
    await runMigrations(created.db);
    seed = () => seedTickets(created.db, NOW);
    app = createApp({
      repository: new DrizzleTicketRepository(created.db),
      token: TOKEN,
      faultInjector: createFaultInjector({ failureRate: 0, latencyMs: 0 }),
      now: () => NOW,
    });
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await seed();
  });

  it("GET /health responde 200 sem autenticação", async () => {
    expect((await app.request("/health")).status).toBe(200);
  });

  it("sem bearer devolve 401", async () => {
    const res = await app.request("/tickets?requesterId=ana.souza");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("bearer errado (mesmo tamanho ou não) devolve 401", async () => {
    for (const bad of ["token-de-testf", "x", `${TOKEN}-extra`]) {
      const res = await app.request("/tickets?requesterId=ana.souza", {
        headers: { Authorization: `Bearer ${bad}` },
      });
      expect(res.status).toBe(401);
    }
  });

  it("lista só os chamados do solicitante e exige requesterId", async () => {
    const res = await app.request("/tickets?requesterId=ana.souza&scope=all", { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { requesterId: string }[];
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((t) => t.requesterId === "ana.souza")).toBe(true);
    const missing = await app.request("/tickets", { headers: auth });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ error: "invalid_request" });
  });

  it("chamado de outro usuário devolve 404 sem vazar dados", async () => {
    const res = await app.request("/tickets/INC-20311?requesterId=carla.mendes", {
      headers: auth,
    });
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("Notebook");
    expect(JSON.parse(text)).toMatchObject({ error: "not_found" });
  });

  it("busca o próprio chamado", async () => {
    const res = await app.request("/tickets/INC-20311?requesterId=ana.souza", { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: "INC-20311" });
  });

  it("POST /tickets repetido com a mesma Idempotency-Key devolve 201 e depois 200 com o mesmo code", async () => {
    const init = {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "draft-1" },
      body: JSON.stringify({ ...draft, requesterId: "ana.souza" }),
    };
    const first = await app.request("/tickets", init);
    const second = await app.request("/tickets", init);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { code: string };
    const b = (await second.json()) as { code: string };
    expect(b.code).toBe(a.code);
  });

  it("POST /tickets sem Idempotency-Key ou com corpo inválido devolve 400", async () => {
    const noKey = await app.request("/tickets", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ ...draft, requesterId: "ana.souza" }),
    });
    expect(noKey.status).toBe(400);
    const invalid = await app.request("/tickets", {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "k-inv" },
      body: JSON.stringify({ title: "" }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_request" });
  });

  it("chave de idempotência de outro solicitante devolve 409", async () => {
    const mk = (requesterId: string) => ({
      method: "POST",
      headers: { ...json, "Idempotency-Key": "draft-shared" },
      body: JSON.stringify({ ...draft, requesterId }),
    });
    expect((await app.request("/tickets", mk("ana.souza"))).status).toBe(201);
    const res = await app.request("/tickets", mk("carla.mendes"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "idempotency_conflict" });
  });

  it("comentário exige Idempotency-Key e devolve 200; de outro dono devolve 404", async () => {
    const url = "/tickets/INC-20311/comments";
    const body = JSON.stringify({ requesterId: "ana.souza", body: "Ainda está lento." });
    expect((await app.request(url, { method: "POST", headers: json, body })).status).toBe(400);
    const ok = await app.request(url, {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "c-1" },
      body,
    });
    expect(ok.status).toBe(200);
    const other = await app.request(url, {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "c-2" },
      body: JSON.stringify({ requesterId: "carla.mendes", body: "x" }),
    });
    expect(other.status).toBe(404);
  });

  it("reabre chamado resolvido e mapeia o 409 de não resolvido", async () => {
    const reopen = (code: string) =>
      app.request(`/tickets/${code}/reopen`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ requesterId: "ana.souza" }),
      });
    const ok = await reopen("INC-20150");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "aberto" });
    const notResolved = await reopen("INC-20311");
    expect(notResolved.status).toBe(409);
    expect(await notResolved.json()).toMatchObject({ error: "not_resolved" });
  });

  it("reabrir chamado resolvido há mais de 7 dias devolve 409 reopen_window_expired", async () => {
    const res = await app.request("/tickets/INC-19877/reopen", {
      method: "POST",
      headers: json,
      body: JSON.stringify({ requesterId: "ana.souza" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "reopen_window_expired" });
  });

  it("comentário repetido com a mesma Idempotency-Key é um replay e devolve 200", async () => {
    const url = "/tickets/INC-20311/comments";
    const key = { ...json, "Idempotency-Key": "c-replay" };
    const first = await app.request(url, {
      method: "POST",
      headers: key,
      body: JSON.stringify({ requesterId: "ana.souza", body: "Primeiro." }),
    });
    expect(first.status).toBe(200);
    const replay = await app.request(url, {
      method: "POST",
      headers: key,
      body: JSON.stringify({ requesterId: "ana.souza", body: "Primeiro." }),
    });
    expect(replay.status).toBe(200);
  });

  it("transfere para o analista", async () => {
    const res = await app.request("/tickets/INC-20311/transfer", {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "t-1" },
      body: JSON.stringify({
        requesterId: "ana.souza",
        summary: "Preciso de um analista.",
        queue: "N1",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "aguardando_analista" });
  });
});
