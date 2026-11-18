import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import { REOPEN_WINDOW_DAYS, canReopen, type TicketDto } from "../src";

const TZ = "America/Sao_Paulo";
const at = (day: number, h = 10) => new TZDate(2026, 10, day, h, 0, TZ);

function ticket(overrides: Partial<TicketDto>): TicketDto {
  return {
    code: "INC-1",
    type: "INC",
    category: "Software",
    priority: "media",
    status: "resolvido",
    title: "t",
    description: "d",
    affected: "individual",
    requesterId: "u1",
    createdAt: at(1).toISOString(),
    updatedAt: at(1).toISOString(),
    lastSupportUpdateAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

describe("canReopen", () => {
  const now = at(18);
  it("janela é de 7 dias", () => expect(REOPEN_WINDOW_DAYS).toBe(7));
  it("resolvido há 4 dias reabre", () => {
    expect(canReopen(ticket({ resolvedAt: at(14).toISOString() }), now)).toBe(true);
  });
  it("resolvido há exatamente 7 dias reabre", () => {
    expect(canReopen(ticket({ resolvedAt: at(11).toISOString() }), now)).toBe(true);
  });
  it("resolvido há 8 dias não reabre", () => {
    expect(canReopen(ticket({ resolvedAt: at(10).toISOString() }), now)).toBe(false);
  });
  it("status aberto não reabre", () => {
    expect(canReopen(ticket({ status: "aberto", resolvedAt: at(14).toISOString() }), now)).toBe(false);
  });
  it("resolvido sem resolvedAt não reabre", () => {
    expect(canReopen(ticket({ resolvedAt: null }), now)).toBe(false);
  });
});
