import { describe, expect, it } from "vitest";
import { buildInstructions } from "../../../src/server/agent/instructions";

const profile = { name: "Ana Souza", department: "Financeiro", deviceOs: "Windows 11" };

describe("buildInstructions", () => {
  it("explica o que fazer quando o rascunho volta com suspeita de duplicado", () => {
    const text = buildInstructions(profile, new Date("2026-11-19T12:00:00Z"));
    expect(text).toContain("duplicate_suspected");
    expect(text).toContain("notDuplicateOf");
  });

  it("cobre os fluxos do Anexo A: rascunho direto, escolha do chamado, consulta, atualização e reabertura", () => {
    const text = buildInstructions(profile, new Date("2026-11-19T12:00:00Z"));
    expect(text).toMatch(/deduza/i);
    expect(text).toContain("ticket_choice");
    expect(text).toContain("get_ticket");
    expect(text).toContain("kind update");
    expect(text).toContain("kind reopen");
    expect(text).toMatch(/nunca de memória/i);
    expect(text).toMatch(/inclusive fora do escopo/i);
  });

  it("procura chamados resolvidos quando o problema voltou e prioriza o rascunho sobre a oferta de analista", () => {
    const text = buildInstructions(profile, new Date("2026-11-19T12:00:00Z"));
    expect(text).toContain('scope "all"');
    expect(text).toMatch(/vencido.*monte o rascunho primeiro/i);
  });

  it("dá exemplos de categoria e exige get_ticket para status", () => {
    const text = buildInstructions(profile, new Date("2026-11-19T12:00:00Z"));
    expect(text).toMatch(/E-mail \(Outlook/);
    expect(text).toMatch(/search_my_tickets não traz prazo/);
  });

  it("pede texto simples, sem markdown, porque o chat não formata", () => {
    const text = buildInstructions(profile, new Date("2026-11-19T12:00:00Z"));
    expect(text).toMatch(/texto simples, sem markdown/);
  });
});
