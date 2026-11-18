import { describe, expect, it } from "vitest";
import { badgeFor } from "../../src/server/conversations/console-badge";

const base = { handoffReason: null, linkedTicketCode: null, confidence: null, analystName: null };

describe("badgeFor", () => {
  it("transferida com o código do chamado vinculado", () => {
    expect(badgeFor({ ...base, state: "waiting_analyst", linkedTicketCode: "INC-20311" })).toEqual({
      tone: "danger",
      text: "Transferida · INC-20311",
    });
  });

  it("transferida sem chamado vinculado", () => {
    expect(badgeFor({ ...base, state: "waiting_analyst" })).toEqual({ tone: "danger", text: "Transferida" });
  });

  it("baixa confiança mostra o percentual do último trace", () => {
    expect(
      badgeFor({ ...base, state: "waiting_analyst", handoffReason: "low_confidence", confidence: 0.41, linkedTicketCode: "INC-1" }),
    ).toEqual({ tone: "warning", text: "Agent pediu ajuda · confiança 41%" });
    expect(badgeFor({ ...base, state: "waiting_analyst", handoffReason: "low_confidence" }).text).toBe("Agent pediu ajuda");
  });

  it("agent, analista e encerrada", () => {
    expect(badgeFor({ ...base, state: "agent" })).toEqual({ tone: "success", text: "Agent atendendo" });
    expect(badgeFor({ ...base, state: "analyst", analystName: "Rafael Lima" })).toEqual({
      tone: "success",
      text: "Em atendimento · Rafael Lima",
    });
    expect(badgeFor({ ...base, state: "closed" })).toEqual({ tone: "neutral", text: "Encerrada" });
  });
});
