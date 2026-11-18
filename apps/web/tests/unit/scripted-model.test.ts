import { describe, expect, it } from "vitest";
import { defaultStep, VPN_TRIGGER } from "@/server/agent/model";

type Msg = { role: string; content: unknown };
const user = (text: string): Msg => ({ role: "user", content: [{ type: "text", text }] });
const toolResult = (value: unknown): Msg => ({
  role: "tool",
  content: [{ type: "tool-result", output: { type: "json", value } }],
});

describe("roteiro padrão do modelo de teste", () => {
  it("segue a ordem de tools para o caso da VPN", () => {
    const prompt: Msg[] = [user(VPN_TRIGGER)];
    const order: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const step = defaultStep(prompt);
      const call = step.toolCalls?.[0];
      expect(call).toBeDefined();
      order.push(call?.name ?? "");
      prompt.push(toolResult({ ok: true, tickets: [{ code: "INC-20311" }] }));
    }
    expect(order).toEqual(["search_my_tickets", "search_help_center", "prepare_ticket_draft", "record_decision"]);
    const final = defaultStep(prompt);
    expect(final.toolCalls).toBeUndefined();
    expect(final.text).toMatch(/rascunho/i);
  });

  it("o rascunho é válido e ignora duplicatas já listadas", () => {
    const prompt: Msg[] = [user(VPN_TRIGGER), toolResult({ tickets: [{ code: "INC-20400" }] }), toolResult({ articles: [] })];
    const input = defaultStep(prompt).toolCalls?.[0]?.input as Record<string, unknown>;
    expect(input).toMatchObject({ kind: "create", type: "INC", category: "Rede e VPN", notDuplicateOf: ["INC-20400"] });
  });

  it("outro texto recebe uma resposta simples com record_decision", () => {
    const prompt: Msg[] = [user("Bom dia")];
    expect(defaultStep(prompt).toolCalls?.[0]?.name).toBe("record_decision");
    prompt.push(toolResult({ recorded: true }));
    const reply = defaultStep(prompt);
    expect(reply.toolCalls).toBeUndefined();
    expect(reply.text).toBeTruthy();
  });

  it("só conta as tools depois da última mensagem do usuário", () => {
    const prompt: Msg[] = [user(VPN_TRIGGER), toolResult({}), toolResult({}), user(VPN_TRIGGER)];
    expect(defaultStep(prompt).toolCalls?.[0]?.name).toBe("search_my_tickets");
  });
});
