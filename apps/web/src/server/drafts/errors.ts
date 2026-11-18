// Rascunho que não está mais em `pending` (já confirmado, cancelado, substituído ou em confirmação).
export class DraftNotPendingError extends Error {
  readonly httpStatus = 409;
  constructor(message = "Este rascunho não está mais pendente de confirmação.") {
    super(message);
    this.name = "DraftNotPendingError";
  }
}

// Inexistente ou de outro funcionário: a resposta é a mesma nos dois casos.
export class DraftNotFoundError extends Error {
  readonly httpStatus = 404;
  constructor(message = "Rascunho não encontrado.") {
    super(message);
    this.name = "DraftNotFoundError";
  }
}
