// "Não encontrado" cobre chamado inexistente e chamado de outro usuário (privacidade).
export class TicketNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Chamado ${code} não encontrado.`);
    this.name = "TicketNotFoundError";
  }
}

export class ReopenWindowExpiredError extends Error {
  constructor(public readonly code: string) {
    super(`O chamado ${code} foi resolvido há mais de 7 dias e não pode ser reaberto.`);
    this.name = "ReopenWindowExpiredError";
  }
}

export class TicketNotResolvedError extends Error {
  constructor(public readonly code: string) {
    super(`O chamado ${code} não está resolvido, então não há o que reabrir.`);
    this.name = "TicketNotResolvedError";
  }
}
