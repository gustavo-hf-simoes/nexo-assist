import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createFaultInjector } from "../src/fault-injection";
import type { TicketRepository } from "../src/ticket-repository";

const TOKEN = "token-de-teste";
const headers = { Authorization: `Bearer ${TOKEN}` };

const unused = async (): Promise<never> => {
  throw new Error("não usado");
};

const stubRepository: TicketRepository = {
  listByRequester: async () => [],
  findByCode: async () => null,
  create: unused,
  addComment: unused,
  reopen: unused,
  transfer: unused,
};

function build(failureRate: number, random: () => number = () => 0) {
  return createApp({
    repository: stubRepository,
    token: TOKEN,
    faultInjector: createFaultInjector({ failureRate, random, latencyMs: 0 }),
  });
}

describe("falhas simuladas", () => {
  it("com failureRate 1, toda rota de negócio devolve 503", async () => {
    const app = build(1);
    const list = await app.request("/tickets?requesterId=ana.souza", { headers });
    expect(list.status).toBe(503);
    expect(await list.json()).toMatchObject({ error: "service_unavailable" });
    const get = await app.request("/tickets/INC-1?requesterId=ana.souza", { headers });
    expect(get.status).toBe(503);
    const post = await app.request("/tickets", {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "k1", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(post.status).toBe(503);
  });

  it("com failureRate 0, nunca falha", async () => {
    const app = build(0, () => 0);
    for (let i = 0; i < 5; i += 1) {
      const res = await app.request("/tickets?requesterId=ana.souza", { headers });
      expect(res.status).toBe(200);
    }
  });

  it("/health não é afetado pela falha injetada nem pela autenticação", async () => {
    const res = await build(1).request("/health");
    expect(res.status).toBe(200);
  });

  it("só falha quando o sorteio fica abaixo da taxa", async () => {
    const app = build(0.3, () => 0.5);
    const res = await app.request("/tickets?requesterId=ana.souza", { headers });
    expect(res.status).toBe(200);
  });

  it("erro desconhecido do repositório vira 500 internal_error sem stack trace", async () => {
    const boom: TicketRepository = {
      ...stubRepository,
      listByRequester: async () => {
        throw new Error("falha secreta de banco em /var/app/db.ts");
      },
    };
    const app = createApp({
      repository: boom,
      token: TOKEN,
      faultInjector: createFaultInjector({ failureRate: 0 }),
    });
    const res = await app.request("/tickets?requesterId=ana.souza", { headers });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ error: "internal_error" });
    expect(text).not.toContain("falha secreta");
    expect(text).not.toContain("at ");
    expect(text).not.toContain("stack");
  });
});
