import { describe, expect, it, vi } from "vitest";
import { checkTicketsHealth } from "@/server/tickets/ticket-health";

describe("checkTicketsHealth", () => {
  it("online quando /health responde ok", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    await expect(checkTicketsHealth(fetchImpl, "http://tickets.test")).resolves.toEqual({ status: "online" });
    expect(fetchImpl).toHaveBeenCalledWith("http://tickets.test/health", expect.anything());
  });

  it("degradado quando responde erro", async () => {
    const fetchImpl = vi.fn(async () => new Response("x", { status: 503 }));
    await expect(checkTicketsHealth(fetchImpl, "http://tickets.test")).resolves.toEqual({ status: "degraded" });
  });

  it("degradado quando a rede falha", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(checkTicketsHealth(fetchImpl, "http://tickets.test/")).resolves.toEqual({ status: "degraded" });
  });
});
