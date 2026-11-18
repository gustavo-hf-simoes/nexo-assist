import { describe, expect, it } from "vitest";
import { classifyChatError } from "@/components/chat/chat-errors";

describe("classifyChatError", () => {
  it("409 com state vira pausado", () => {
    expect(classifyChatError(new Error('{"state":"waiting_analyst"}')).kind).toBe("paused");
  });
  it("429 de cota e limite diário", () => {
    expect(classifyChatError(new Error('{"error":"quota_exceeded","used":30,"limit":30}')).kind).toBe("quota");
    expect(classifyChatError(new Error('{"error":"daily_limit"}')).kind).toBe("daily_limit");
  });
  it("erro de rede permite tentar de novo", () => {
    const result = classifyChatError(new TypeError("Failed to fetch"));
    expect(result.kind).toBe("network");
    expect(result.retry).toBe(true);
  });
  it("texto em pt-BR vindo do servidor é preservado", () => {
    const result = classifyChatError(new Error("Não consegui processar sua mensagem agora. Tente novamente em instantes."));
    expect(result.kind).toBe("server");
    expect(result.message).toContain("Não consegui processar");
    expect(result.retry).toBe(true);
  });
  it("falha ao salvar a resposta não oferece tentar de novo", () => {
    const result = classifyChatError(
      new Error("Não consegui salvar esta resposta no histórico. Ela pode não aparecer ao recarregar a conversa."),
    );
    expect(result.kind).toBe("persist");
    expect(result.retry).toBe(false);
  });
  it("JSON com error em texto usa a mensagem", () => {
    expect(classifyChatError(new Error('{"error":"Envie uma mensagem de 1 a 2000 caracteres."}')).message).toBe(
      "Envie uma mensagem de 1 a 2000 caracteres.",
    );
  });
});
