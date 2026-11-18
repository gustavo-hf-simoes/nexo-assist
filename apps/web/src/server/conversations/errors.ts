export class InvalidTransitionError extends Error {
  constructor(message = "Transição de estado inválida para esta conversa.") {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export class QuotaExceededError extends Error {
  constructor(message = "Limite de mensagens da sessão atingido.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}
