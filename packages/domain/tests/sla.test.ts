import { describe, expect, it } from "vitest";
import { TZDate } from "@date-fns/tz";
import {
  computeDueAt,
  isOverdue,
  slaBaseOf,
  slaLabel,
  type Priority,
  type TicketDto,
} from "../src";

const TZ = "America/Sao_Paulo";
const at = (day: number, h: number, min = 0) => new TZDate(2026, 10, day, h, min, TZ);
// Novembro de 2026: 18 = quarta, 20 = sexta, 21 = sábado, 23 = segunda.

describe("computeDueAt", () => {
  const cases: Array<[string, Priority, TZDate, TZDate]> = [
    ["Alta dentro do expediente", "alta", at(18, 9, 43), at(18, 13, 43)],
    ["Alta atravessa fim de semana", "alta", at(20, 17), at(23, 11)],
    ["Alta aberta no sábado", "alta", at(21, 10), at(23, 12)],
    ["Alta aberta depois das 18h", "alta", at(17, 19, 30), at(18, 12)],
    ["Crítica é 24x7", "critica", at(21, 10), at(21, 11)],
    ["Média, 3 dias úteis", "media", at(18, 14, 20), at(23, 14, 20)],
    ["Baixa, 5 dias úteis", "baixa", at(23, 9), at(30, 9)],
  ];
  it.each(cases)("%s", (_name, priority, from, expected) => {
    expect(computeDueAt(priority, from).getTime()).toBe(expected.getTime());
  });

  it("Média aberta no sábado parte da segunda 08:00", () => {
    expect(computeDueAt("media", at(21, 10)).getTime()).toBe(at(26, 8).getTime());
  });
});

describe("computeDueAt com segundos no início", () => {
  it("Alta aberta às 14:00:20 não ultrapassa as 18:00 do mesmo dia", () => {
    const from = new TZDate(2026, 10, 18, 14, 0, 20, TZ);
    expect(computeDueAt("alta", from).getTime()).toBe(at(19, 8, 1).getTime());
  });
});

describe("slaLabel", () => {
  it("descreve cada prazo", () => {
    expect(slaLabel("critica")).toBe("1 hora");
    expect(slaLabel("alta")).toBe("4 horas úteis");
    expect(slaLabel("media")).toBe("3 dias úteis");
    expect(slaLabel("baixa")).toBe("5 dias úteis");
  });
});

function ticket(overrides: Partial<TicketDto> = {}): TicketDto {
  return {
    code: "INC-1",
    type: "INC",
    category: "Software",
    priority: "media",
    status: "aguardando_analista",
    title: "t",
    description: "d",
    affected: "individual",
    requesterId: "u1",
    createdAt: at(10, 9).toISOString(),
    updatedAt: at(10, 9).toISOString(),
    lastSupportUpdateAt: null,
    resolvedAt: null,
    ...overrides,
  };
}

describe("slaBaseOf", () => {
  it("usa createdAt sem atualização do suporte", () => {
    const t = ticket();
    expect(slaBaseOf(t).getTime()).toBe(new Date(t.createdAt).getTime());
  });
  it("usa lastSupportUpdateAt quando existe", () => {
    const last = at(12, 15).toISOString();
    expect(slaBaseOf(ticket({ lastSupportUpdateAt: last })).getTime()).toBe(new Date(last).getTime());
  });
});

describe("isOverdue", () => {
  it("vence com 6 dias corridos desde a última atualização", () => {
    const t = ticket({ lastSupportUpdateAt: at(11, 10).toISOString() }); // qua 11/11
    expect(isOverdue(t, at(17, 10))).toBe(true); // ter 17/11, 6 dias corridos
  });
  it("não vence com 2 dias corridos", () => {
    const t = ticket({ lastSupportUpdateAt: at(18, 10).toISOString() }); // qua
    expect(isOverdue(t, at(20, 10))).toBe(false); // sex
  });
  it("chamado resolvido nunca está vencido", () => {
    const t = ticket({ status: "resolvido", lastSupportUpdateAt: at(11, 10).toISOString() });
    expect(isOverdue(t, at(18, 10))).toBe(false);
  });
  it("sem lastSupportUpdateAt usa createdAt", () => {
    const t = ticket({ createdAt: at(10, 9).toISOString() });
    expect(isOverdue(t, at(18, 10))).toBe(true);
  });
});
