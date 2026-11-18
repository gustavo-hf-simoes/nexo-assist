import { describe, expect, it } from "vitest";
import { searchSeedArticles } from "../../evals/in-memory-articles";
import { runScenario } from "../../evals/harness";
import { extractToolCalls } from "../../evals/observe";
import { renderReport } from "../../evals/report";
import { SCENARIOS } from "../../evals/scenarios";
import { scoreScenario } from "../../evals/score";
import { setScript, type ScriptStep } from "../../src/server/agent/model";

describe("busca de artigos em memória", () => {
  it("acha o artigo da VPN e o do horário pelo assunto", async () => {
    expect((await searchSeedArticles("vpn erro 809"))[0]?.slug).toBe("vpn-erro-809");
    expect((await searchSeedArticles("qual o horário do service desk?"))[0]?.slug).toBe("horario-do-service-desk");
  });

  it("ignora acentos e devolve no máximo 3 resultados", async () => {
    expect((await searchSeedArticles("horario plantao"))[0]?.slug).toBe("horario-do-service-desk");
    expect((await searchSeedArticles("rede senha notebook e-mail")).length).toBeLessThanOrEqual(3);
  });

  it("não devolve nada para consulta vazia ou sem relação com TI", async () => {
    expect(await searchSeedArticles("   ")).toEqual([]);
    expect(await searchSeedArticles("ferias")).toEqual([]);
  });
});

describe("extractToolCalls", () => {
  it("lê as chamadas no formato dos passos do Mastra, com o resultado casado por id", () => {
    const steps = [
      {
        toolCalls: [
          { payload: { toolCallId: "1", toolName: "get_ticket", args: { code: "INC-20311" } } },
          { payload: { toolCallId: "2", toolName: "search_my_tickets", args: { scope: "open" } } },
        ],
        toolResults: [
          { payload: { toolCallId: "1", toolName: "get_ticket", result: { ok: false } } },
          { payload: { toolCallId: "2", toolName: "search_my_tickets", result: { ok: true } } },
        ],
      },
    ];
    expect(extractToolCalls(steps)).toEqual([
      { id: "get_ticket", input: { code: "INC-20311" }, ok: false },
      { id: "search_my_tickets", input: { scope: "open" }, ok: true },
    ]);
  });

  it("aceita chamadas sem o envelope payload e ignora tools desconhecidas", () => {
    const steps = [
      {
        toolCalls: [
          { toolCallId: "1", toolName: "present_choices", input: { kind: "ticket_choice" } },
          { toolCallId: "2", toolName: "inventada", input: {} },
        ],
        toolResults: [],
      },
    ];
    expect(extractToolCalls(steps)).toEqual([{ id: "present_choices", input: { kind: "ticket_choice" }, ok: true }]);
  });

  it("devolve lista vazia para entrada inesperada", () => {
    expect(extractToolCalls(undefined)).toEqual([]);
    expect(extractToolCalls([{}])).toEqual([]);
  });
});

function scenarioByPrefix(prefix: string) {
  const found = SCENARIOS.find((s) => s.name.startsWith(prefix));
  if (!found) throw new Error(`cenário ${prefix} não existe`);
  return found;
}

const record = (intent: string): ScriptStep => ({
  toolCalls: [
    { name: "record_decision", input: { intent, understanding: "u", action: "a", confidence: 0.9, rationale: "r" } },
  ],
});

describe("runScenario com o modelo roteirizado", () => {
  it("o cenário 01 passa quando o roteiro faz o que o cenário espera", async () => {
    setScript([
      { toolCalls: [{ name: "search_my_tickets", input: { scope: "open" } }] },
      { toolCalls: [{ name: "search_help_center", input: { query: "vpn erro 809" } }] },
      { text: "Não achei solução na central. Só você é afetado?" },
      // Turno 2: com "só eu" e prazo no mesmo dia, o rascunho sai com prioridade alta.
      {
        toolCalls: [
          {
            name: "prepare_ticket_draft",
            input: {
              kind: "create",
              title: "VPN não conecta — erro 809",
              description: "Erro 809 ao conectar na VPN.",
              type: "INC",
              category: "Rede e VPN",
              impact: "individual",
              blocksWork: true,
              sameDayDeadline: true,
              affectedLabel: "Somente você",
              notDuplicateOf: ["INC-20311", "REQ-10442"],
            },
          },
        ],
      },
      record("ticket_create"),
      { text: "Montei o rascunho abaixo. Confirme para abrir." },
    ]);
    const run = await runScenario(scenarioByPrefix("01"), { modelId: "test/scripted" });
    expect(run.observed.toolCalls.map((c) => c.id)).toEqual([
      "search_my_tickets",
      "search_help_center",
      "prepare_ticket_draft",
      "record_decision",
    ]);
    expect(run.observed.intent).toBe("ticket_create");
    expect(run.observed.draft).toMatchObject({ kind: "create", category: "Rede e VPN", priority: "alta" });
    expect(run.observed.answer).toContain("rascunho");
    expect(run.tokens).toBeGreaterThan(0);
    expect(scoreScenario(scenarioByPrefix("01"), run.observed)).toEqual({ passed: true, reasons: [] });
  });

  it("reprova quando o agent não chama o que o cenário exige", async () => {
    setScript([record("smalltalk"), { text: "Olá!" }]);
    const scenario = scenarioByPrefix("09");
    const run = await runScenario(scenario, { modelId: "test/scripted" });
    const result = scoreScenario(scenario, run.observed);
    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("handoff_to_analyst");
  });

  it("registra o motivo da transferência no cenário 09", async () => {
    setScript([
      { toolCalls: [{ name: "handoff_to_analyst", input: { reason: "user_request", summary: "Quer falar com um analista." } }] },
      record("handoff_request"),
      { text: "Chamei um analista para você." },
    ]);
    const scenario = scenarioByPrefix("09");
    const run = await runScenario(scenario, { modelId: "test/scripted" });
    expect(run.observed.handoff).toBe("user_request");
    expect(scoreScenario(scenario, run.observed).passed).toBe(true);
  });

  it("o chamado de outra pessoa volta como não encontrado (cenário 11)", async () => {
    setScript([
      { toolCalls: [{ name: "get_ticket", input: { code: "INC-20420" } }] },
      record("ticket_status"),
      { text: "Não encontrei esse chamado entre os seus." },
    ]);
    const scenario = scenarioByPrefix("11");
    const run = await runScenario(scenario, { modelId: "test/scripted" });
    expect(run.observed.toolCalls[0]).toMatchObject({ id: "get_ticket", ok: false });
    expect(scoreScenario(scenario, run.observed).passed).toBe(true);
  });
});

describe("renderReport", () => {
  it("mostra a tabela, a taxa e os motivos das falhas", () => {
    const text = renderReport({
      modelId: "google/gemini-x",
      generatedAt: new Date("2026-11-18T12:00:00Z"),
      minPassRate: 0.9,
      rows: [
        { name: "01 a", passed: true, reasons: [], tokens: 1000, ms: 1200 },
        { name: "02 b", passed: false, reasons: ["tool proibida foi chamada: get_ticket"], tokens: 500, ms: 800 },
      ],
    });
    expect(text).toContain("google/gemini-x");
    expect(text).toContain("| 01 a | aprovado | 1000 |");
    expect(text).toContain("| 02 b | reprovado | 500 |");
    expect(text).toContain("50%");
    expect(text).toContain("tool proibida foi chamada: get_ticket");
    expect(text).toContain("abaixo do mínimo");
  });
});
