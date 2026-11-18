export class TicketServiceUnavailableError extends Error {
  constructor(message = "O serviço de chamados está indisponível.") {
    super(message);
    this.name = "TicketServiceUnavailableError";
  }
}

export type TicketConflictCode = "reopen_window_expired" | "not_resolved" | "idempotency_conflict";

export class TicketConflictError extends Error {
  constructor(readonly code: TicketConflictCode) {
    super(`Conflito no chamado: ${code}`);
    this.name = "TicketConflictError";
  }
}

// Chamado inexistente ou de outro usuário: o serviço responde igual nos dois casos.
export class TicketNotFoundError extends Error {
  constructor(message = "Chamado não encontrado.") {
    super(message);
    this.name = "TicketNotFoundError";
  }
}

// Resposta 4xx (ou corpo inválido) que não adianta repetir.
export class TicketRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TicketRequestError";
  }
}
