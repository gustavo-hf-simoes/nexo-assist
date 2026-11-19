import type { TicketDto } from "@nexo/domain";
import { describe, expect, it, vi } from "vitest";
import { HttpTicketGateway } from "../../src/server/tickets/http-ticket-gateway";
import {
  TicketConflictError,
  TicketNotFoundError,
  TicketRequestError,
  TicketServiceUnavailableError,
} from "../../src/server/tickets/ticket-errors";

const ticket: TicketDto = {
  code: "INC-0001",
  type: "INC",
  category: "Rede e VPN",
  priority: "alta",
  status: "aberto",
  title: "VPN não conecta",
  description: "Erro 809",
  affected: "individual",
  requesterId: "ana.souza",
  createdAt: "2026-11-18T12:00:00.000Z",
  updatedAt: "2026-11-18T12:00:00.000Z",
  lastSupportUpdateAt: null,
  resolvedAt: null,
};

const input = {
  title: "VPN não conecta",
  description: "Erro 809",
  type: "INC",
  category: "Rede e VPN",
  affected: "individual",
  blocksWork: true,
  sameDayDeadline: false,
} as const;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(responses: Array<() => Promise<Response> | Response>, timeoutMs = 2000) {
  const queue = [...responses];
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("sem resposta programada");
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
  const gateway = new HttpTicketGateway({
    baseUrl: "http://tickets.test/",
    token: "tok",
    fetch: fetchMock,
    sleep,
    timeoutMs,
  });
  return { gateway, fetchMock, sleep };
}

const headerOf = (call: unknown[], name: string): string | undefined =>
  (call[1] as RequestInit).headers
    ? ((call[1] as RequestInit).headers as Record<string, string>)[name]
    : undefined;

describe("HttpTicketGateway", () => {
  it("503, 503, 201 resolve com 3 chamadas e a mesma Idempotency-Key", async () => {
    const { gateway, fetchMock } = setup([
      () => json(503, { error: "x" }),
      () => json(503, { error: "x" }),
      () => json(201, ticket),
    ]);
    await expect(gateway.create("ana.souza", input, "draft-1")).resolves.toEqual(ticket);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls) {
      expect(headerOf(call, "Idempotency-Key")).toBe("draft-1");
      expect(headerOf(call, "Authorization")).toBe("Bearer tok");
    }
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://tickets.test/tickets");
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({
      requesterId: "ana.souza",
      title: "VPN não conecta",
    });
  });

  it("503 três vezes lança TicketServiceUnavailableError", async () => {
    const { gateway, fetchMock } = setup([
      () => json(503, {}),
      () => json(503, {}),
      () => json(503, {}),
    ]);
    await expect(gateway.create("ana.souza", input, "k")).rejects.toBeInstanceOf(
      TicketServiceUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("o backoff chama sleep(200) e depois sleep(400), sem dormir depois da última", async () => {
    const { gateway, sleep } = setup([() => json(500, {}), () => json(500, {}), () => json(500, {})]);
    await gateway.create("a", input, "k").catch(() => undefined);
    expect(sleep.mock.calls).toEqual([[200], [400]]);
  });

  it("404 em getMine devolve null sem retry", async () => {
    const { gateway, fetchMock } = setup([() => json(404, { error: "not_found" })]);
    await expect(gateway.getMine("ana.souza", "INC-0009")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://tickets.test/tickets/INC-0009?requesterId=ana.souza",
    );
  });

  it("404 em addComment, reopen e transfer lança TicketNotFoundError", async () => {
    const { gateway } = setup([
      () => json(404, {}),
      () => json(404, {}),
      () => json(404, {}),
    ]);
    await expect(gateway.addComment("a", "INC-1", "oi", "k")).rejects.toBeInstanceOf(
      TicketNotFoundError,
    );
    await expect(gateway.reopen("a", "INC-1", "r")).rejects.toBeInstanceOf(TicketNotFoundError);
    await expect(
      gateway.transfer("a", "INC-1", { summary: "s", queue: "N2" }, "t"),
    ).rejects.toBeInstanceOf(TicketNotFoundError);
  });

  it("400 lança na primeira tentativa, sem retry", async () => {
    const { gateway, fetchMock, sleep } = setup([() => json(400, { error: "invalid_request" })]);
    await expect(gateway.create("a", input, "k")).rejects.toBeInstanceOf(TicketRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("timeout conta como falha e permite retry", async () => {
    const hangUntilAbort = vi.fn<typeof fetch>((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
      });
    });
    let calls = 0;
    const fetchMock = vi.fn<typeof fetch>((url, init) => {
      calls += 1;
      return calls === 1 ? hangUntilAbort(url, init) : Promise.resolve(json(200, ticket));
    });
    const gateway = new HttpTicketGateway({
      baseUrl: "http://tickets.test",
      token: "t",
      fetch: fetchMock,
      sleep: async () => undefined,
      timeoutMs: 10,
    });
    await expect(gateway.getMine("ana.souza", "INC-0001")).resolves.toEqual(ticket);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("erro de rede também é repetido", async () => {
    const { gateway, fetchMock } = setup([
      () => {
        throw new TypeError("fetch failed");
      },
      () => json(200, [ticket]),
    ]);
    await expect(gateway.listMine("ana.souza", "all")).resolves.toEqual([ticket]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://tickets.test/tickets?requesterId=ana.souza&scope=all",
    );
  });

  it("409 vira TicketConflictError com o código mapeado e sem retry", async () => {
    const { gateway, fetchMock } = setup([
      () => json(409, { error: "reopen_window_expired" }),
      () => json(409, { error: "not_resolved" }),
      () => json(409, { error: "idempotency_conflict" }),
    ]);
    const codes: string[] = [];
    for (const run of [
      () => gateway.reopen("a", "INC-1", "r"),
      () => gateway.reopen("a", "INC-1", "r"),
      () => gateway.create("a", input, "k"),
    ]) {
      await run().catch((e: unknown) => {
        if (e instanceof TicketConflictError) codes.push(e.code);
      });
    }
    expect(codes).toEqual(["reopen_window_expired", "not_resolved", "idempotency_conflict"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("transfer envia a Idempotency-Key recebida em todos os retries", async () => {
    const { gateway, fetchMock } = setup([() => json(502, {}), () => json(200, ticket)]);
    await gateway.transfer("a", "INC-1", { summary: "s", queue: "N1" }, "t-1");
    const keys = fetchMock.mock.calls.map((c) => headerOf(c, "Idempotency-Key"));
    expect(keys).toEqual(["t-1", "t-1"]);
  });

  it("reopen envia a Idempotency-Key recebida", async () => {
    const { gateway, fetchMock } = setup([() => json(200, ticket)]);
    await gateway.reopen("a", "INC-1", "r-1");
    expect(fetchMock.mock.calls.map((c) => headerOf(c, "Idempotency-Key"))).toEqual(["r-1"]);
  });

  it("resposta fora do contrato do TicketDto é recusada", async () => {
    const { gateway } = setup([() => json(200, { code: "INC-1" })]);
    await expect(gateway.reopen("a", "INC-1", "r")).rejects.toBeInstanceOf(TicketRequestError);
  });
});
