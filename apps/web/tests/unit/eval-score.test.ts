import { describe, expect, it } from "vitest";
import { SCENARIOS, type Scenario } from "../../evals/scenarios";
import {
  meetsThreshold,
  parseMinPassRate,
  passRate,
  scoreScenario,
  type Observed,
} from "../../evals/score";
import { TOOL_IDS } from "../../src/server/agent/tools/action-labels";

function scenario(expectation: Scenario["expect"]): Scenario {
  return { name: "teste", employee: "ana.souza", turns: ["oi"], expect: expectation };
}

function observed(partial: Partial<Observed> = {}): Observed {
  return { toolCalls: [], intent: undefined, draft: undefined, handoff: undefined, answer: "", ...partial };
}

const call = (id: Observed["toolCalls"][number]["id"], input: unknown = {}) => ({ id, input, ok: true });

describe("scoreScenario", () => {
  it("aprova quando não há expectativa nenhuma", () => {
    expect(scoreScenario(scenario({}), observed())).toEqual({ passed: true, reasons: [] });
  });

  it("reprova quando falta uma tool esperada e diz qual", () => {
    const result = scoreScenario(scenario({ tools: ["search_help_center"] }), observed({ toolCalls: [call("get_ticket")] }));
    expect(result.passed).toBe(false);
    expect(result.reasons).toEqual([expect.stringContaining("search_help_center")]);
  });

  it("reprova quando uma tool proibida foi chamada", () => {
    const result = scoreScenario(
      scenario({ forbiddenTools: ["prepare_ticket_draft"] }),
      observed({ toolCalls: [call("prepare_ticket_draft")] }),
    );
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("prepare_ticket_draft");
  });

  it("compara os argumentos esperados de uma tool só pelas chaves listadas", () => {
    const expectation = scenario({ toolArgs: [{ tool: "get_ticket", args: { code: "INC-20311" } }] });
    const ok = observed({ toolCalls: [call("get_ticket", { code: "INC-20311", extra: 1 })] });
    const wrong = observed({ toolCalls: [call("get_ticket", { code: "INC-1" })] });
    expect(scoreScenario(expectation, ok).passed).toBe(true);
    expect(scoreScenario(expectation, wrong).passed).toBe(false);
  });

  it("aceita qualquer chamada da tool que case com os argumentos", () => {
    const expectation = scenario({ toolArgs: [{ tool: "get_ticket", args: { code: "INC-20311" } }] });
    const result = scoreScenario(
      expectation,
      observed({ toolCalls: [call("get_ticket", { code: "INC-1" }), call("get_ticket", { code: "INC-20311" })] }),
    );
    expect(result.passed).toBe(true);
  });

  it("confere a intenção registrada", () => {
    expect(scoreScenario(scenario({ intent: "question" }), observed({ intent: "question" })).passed).toBe(true);
    const result = scoreScenario(scenario({ intent: "question" }), observed({ intent: "unclear" }));
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/question/);
    expect(scoreScenario(scenario({ intent: "question" }), observed()).passed).toBe(false);
  });

  it("confere o rascunho campo a campo e reprova se não houve rascunho", () => {
    const expectation = scenario({ draft: { kind: "create", priority: "alta" } });
    const draft = { kind: "create", priority: "media", title: "x" } as Observed["draft"];
    const wrongPriority = scoreScenario(expectation, observed({ draft }));
    expect(wrongPriority.passed).toBe(false);
    expect(wrongPriority.reasons).toEqual([expect.stringContaining("priority")]);
    expect(scoreScenario(expectation, observed()).reasons[0]).toMatch(/rascunho/);
    const right = { kind: "create", priority: "alta" } as Observed["draft"];
    expect(scoreScenario(expectation, observed({ draft: right })).passed).toBe(true);
  });

  it("confere o motivo da transferência", () => {
    expect(scoreScenario(scenario({ handoff: "user_request" }), observed({ handoff: "user_request" })).passed).toBe(true);
    expect(scoreScenario(scenario({ handoff: "user_request" }), observed({ handoff: "critical" })).passed).toBe(false);
    expect(scoreScenario(scenario({ handoff: "user_request" }), observed()).passed).toBe(false);
  });

  it("confere trechos da resposta sem diferenciar maiúsculas", () => {
    const answer = observed({ answer: "Posso chamar um Analista para você." });
    expect(scoreScenario(scenario({ answerIncludes: ["analista"] }), answer).passed).toBe(true);
    expect(scoreScenario(scenario({ answerIncludes: ["férias"] }), answer).passed).toBe(false);
    expect(scoreScenario(scenario({ answerExcludes: ["VPN cai"] }), observed({ answer: "A VPN cai a cada 10 min" })).passed).toBe(false);
    expect(scoreScenario(scenario({ answerExcludes: ["VPN cai"] }), answer).passed).toBe(true);
  });

  it("junta todos os motivos de reprovação", () => {
    const result = scoreScenario(
      scenario({ tools: ["get_ticket"], intent: "question", handoff: "critical" }),
      observed(),
    );
    expect(result.reasons).toHaveLength(3);
  });
});

describe("passRate e limite", () => {
  it("calcula a taxa de aprovação", () => {
    expect(passRate([{ passed: true }, { passed: true }, { passed: false }, { passed: true }])).toBe(0.75);
    expect(passRate([])).toBe(0);
  });

  it("compara a taxa com o mínimo (igual ao mínimo passa)", () => {
    expect(meetsThreshold(0.9, 0.9)).toBe(true);
    expect(meetsThreshold(0.89, 0.9)).toBe(false);
  });

  it("lê EVAL_MIN_PASS_RATE com padrão 0.9 e valida a faixa", () => {
    expect(parseMinPassRate(undefined)).toBe(0.9);
    expect(parseMinPassRate("")).toBe(0.9);
    expect(parseMinPassRate("0.75")).toBe(0.75);
    expect(() => parseMinPassRate("1.5")).toThrowError(/EVAL_MIN_PASS_RATE/);
    expect(() => parseMinPassRate("abc")).toThrowError(/EVAL_MIN_PASS_RATE/);
  });
});

describe("cenários", () => {
  it("são pelo menos 12, com nomes únicos", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SCENARIOS.map((s) => s.name)).size).toBe(SCENARIOS.length);
  });

  it("só citam tools que existem e têm pelo menos um turno", () => {
    for (const s of SCENARIOS) {
      expect(s.turns.length).toBeGreaterThan(0);
      const cited = [
        ...(s.expect.tools ?? []),
        ...(s.expect.forbiddenTools ?? []),
        ...(s.expect.toolArgs ?? []).map((t) => t.tool),
      ];
      for (const id of cited) expect(TOOL_IDS).toContain(id);
    }
  });
});
