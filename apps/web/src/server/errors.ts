export class UnauthorizedError extends Error {
  constructor(message = "Sessão ausente ou inválida.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Acesso negado.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Converte as falhas de autenticação/autorização em resposta HTTP; o resto vira 500 genérico.
export function toHttpError(error: unknown): Response {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return Response.json({ error: "Erro interno." }, { status: 500 });
}
