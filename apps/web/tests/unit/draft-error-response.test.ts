import { describe, expect, it } from "vitest";
import { draftErrorResponse } from "../../src/server/drafts/draft-actions";
import { TicketConflictError, TicketNotFoundError, TicketRequestError } from "../../src/server/tickets/ticket-errors";

async function bodyOf(response: Response | undefined): Promise<string> {
  return ((await response?.json()) as { error: string }).error;
}

describe("draftErrorResponse com erros do serviço de chamados", () => {
  it("reopen_window_expired vira 409 explicando o prazo de 7 dias", async () => {
    const response = draftErrorResponse(new TicketConflictError("reopen_window_expired"));
    expect(response?.status).toBe(409);
    expect(await bodyOf(response)).toContain("7 dias");
  });

  it("not_resolved vira 409 dizendo que o chamado não está resolvido", async () => {
    const response = draftErrorResponse(new TicketConflictError("not_resolved"));
    expect(response?.status).toBe(409);
    expect(await bodyOf(response)).toContain("não está resolvido");
  });

  it("idempotency_conflict vira 409 em pt-BR", async () => {
    const response = draftErrorResponse(new TicketConflictError("idempotency_conflict"));
    expect(response?.status).toBe(409);
    expect(await bodyOf(response)).toContain("rascunho");
  });

  it("chamado inexistente ou de outro usuário vira 404", async () => {
    const response = draftErrorResponse(new TicketNotFoundError());
    expect(response?.status).toBe(404);
    expect(await bodyOf(response)).toBe("Chamado não encontrado.");
  });

  it("requisição recusada pelo serviço vira 422 sem vazar o detalhe técnico", async () => {
    const response = draftErrorResponse(new TicketRequestError("detalhe técnico interno", 400));
    expect(response?.status).toBe(422);
    expect(await bodyOf(response)).not.toContain("técnico");
  });
});
