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

// A conversa está com outro analista: quem tenta agir nela não é o responsável.
export class NotAssignedError extends Error {
  constructor(message = "Esta conversa está com outro analista.") {
    super(message);
    this.name = "NotAssignedError";
  }
}

// Subclasse de InvalidTransitionError: quem já tratava a transição inválida continua funcionando.
export class ConversationNotFoundError extends InvalidTransitionError {
  constructor(message = "Conversa não encontrada.") {
    super(message);
    this.name = "ConversationNotFoundError";
  }
}
