import { describe, expect, it } from "vitest";
import { applyPostTurnPolicy, buildDecisionTrace, type TraceStep } from "../../src/server/agent/decision-trace";

const call = (toolName: string, args: Record<string, unknown>, id = toolName) => ({
  type: "tool-call" as const,
  payload: { toolCallId: id, toolName, args },
});
const result = (toolName: string, value: unknown, id = toolName, isError = false) => ({
  type: "tool-result" as const,
  payload: { toolCallId: id, toolName, result: value, isError },
});

const decision = (confidence: number) => ({
  intent: "ticket_status",
  understanding: "Quer saber dos chamados abertos.",
  action: "Listar chamados",
  confidence,
  rationale: "Pedido direto.",
});

describe("buildDecisionTrace", () => {
  const startedAt = Date.now() - 250;

  it("gera labels da tool e a confiança de record_decision", () => {
    const steps: TraceStep[] = [
      {
        toolCalls: [call("search_my_tickets", { scope: "open" }), call("record_decision", decision(0.41))],
        toolResults: [result("search_my_tickets", { ok: true, tickets: [] }), result("record_decision", { recorded: true })],
      },
    ];
    const trace = buildDecisionTrace(steps, startedAt, "test/scripted");
    expect(trace.tools.flatMap((t) => t.labels)).toEqual(["consultou seus chamados"]);
    expect(trace.confidence).toBe(0.41);
    expect(trace.intent).toBe("ticket_status");
    expect(trace.model).toBe("test/scripted");
    expect(trace.latencyMs).toBeGreaterThanOrEqual(250);
    expect(trace.tools[0]).toMatchObject({ id: "search_my_tickets", ok: true });
  });

  it("sem record_decision: confidence null e intent unclear", () => {
    const trace = buildDecisionTrace([{ toolCalls: [], toolResults: [] }], Date.now(), "m");
    expect(trace.confidence).toBeNull();
    expect(trace.intent).toBe("unclear");
  });

  it("ignora record_decision que falhou na validação", () => {
    const steps: TraceStep[] = [
      { toolCalls: [call("record_decision", decision(0.9))], toolResults: [result("record_decision", "erro", "record_decision", true)] },
    ];
    expect(buildDecisionTrace(steps, Date.now(), "m").confidence).toBeNull();
  });

  it("marca ok=false quando a tool devolve ok:false e usa o código no label de get_ticket", () => {
    const steps: TraceStep[] = [
      { toolCalls: [call("get_ticket", { code: "INC-1" })], toolResults: [result("get_ticket", { ok: false, error: "not_found" })] },
    ];
    const [tool] = buildDecisionTrace(steps, Date.now(), "m").tools;
    expect(tool?.ok).toBe(false);
    expect(tool?.labels).toEqual(["consultou o INC-1", "calculou o prazo"]);
  });
});

describe("applyPostTurnPolicy", () => {
  const traceWith = (confidence: number, extra: TraceStep[] = []) =>
    buildDecisionTrace(
      [
        ...extra,
        { toolCalls: [call("record_decision", decision(confidence))], toolResults: [result("record_decision", { recorded: true })] },
      ],
      Date.now(),
      "m",
    );

  it("confiança abaixo do mínimo transfere por low_confidence", () => {
    expect(applyPostTurnPolicy(traceWith(0.41), 0.6)).toMatchObject({ type: "handoff", reason: "low_confidence" });
  });

  it("não transfere de novo quando handoff_to_analyst já rodou", () => {
    const handoff: TraceStep = {
      toolCalls: [call("handoff_to_analyst", { reason: "user_request", summary: "x" })],
      toolResults: [result("handoff_to_analyst", { ok: true })],
    };
    expect(applyPostTurnPolicy(traceWith(0.41, [handoff]), 0.6)).toBeNull();
  });

  it("confiança suficiente ou ausente não transfere", () => {
    expect(applyPostTurnPolicy(traceWith(0.9), 0.6)).toBeNull();
    expect(applyPostTurnPolicy(buildDecisionTrace([], Date.now(), "m"), 0.6)).toBeNull();
  });
});
