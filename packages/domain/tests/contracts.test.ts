import { describe, expect, it } from "vitest";
import { CreateTicketInput } from "../src/index";

const valid = {
  title: "VPN não conecta",
  description: "A VPN cai ao autenticar.",
  type: "INC",
  category: "Rede e VPN",
  affected: "individual",
  blocksWork: true,
  sameDayDeadline: false,
};

describe("CreateTicketInput", () => {
  it("aceita uma entrada válida", () => {
    expect(CreateTicketInput.safeParse(valid).success).toBe(true);
  });

  it("rejeita categoria fora da lista", () => {
    expect(CreateTicketInput.safeParse({ ...valid, category: "RH" }).success).toBe(false);
  });

  it("rejeita título vazio", () => {
    expect(CreateTicketInput.safeParse({ ...valid, title: "   " }).success).toBe(false);
  });

  it("rejeita título com mais de 120 caracteres", () => {
    expect(CreateTicketInput.safeParse({ ...valid, title: "a".repeat(121) }).success).toBe(false);
  });

  it("aceita título com exatamente 120 caracteres", () => {
    expect(CreateTicketInput.safeParse({ ...valid, title: "a".repeat(120) }).success).toBe(true);
  });
});
