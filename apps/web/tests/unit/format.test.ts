import { describe, expect, it } from "vitest";
import { formatDue, formatListTime, formatShortDate, initialsOf } from "@/lib/format";

describe("format", () => {
  it("prazo no mesmo dia mostra só o horário em America/Sao_Paulo", () => {
    expect(formatDue("2026-11-18T16:43:00.000Z", new Date("2026-11-18T14:00:00.000Z"))).toBe("13:43");
  });
  it("prazo em outro dia mostra data e horário", () => {
    expect(formatDue("2026-11-20T13:00:00.000Z", new Date("2026-11-18T14:00:00.000Z"))).toMatch(/20 nov.*10:00/);
  });
  it("data curta pt-BR", () => {
    expect(formatShortDate("2026-10-16T17:20:00.000Z")).toBe("16 out");
  });
  it("iniciais", () => {
    expect(initialsOf("Ana Souza")).toBe("AS");
    expect(initialsOf("Rafael")).toBe("R");
  });
  it("lista: hora no mesmo dia, data curta em outro", () => {
    const now = new Date("2026-11-18T14:00:00.000Z");
    expect(formatListTime("2026-11-18T12:05:00.000Z", now)).toBe("09:05");
    expect(formatListTime("2026-11-16T12:05:00.000Z", now)).toBe("16 nov");
  });
});
