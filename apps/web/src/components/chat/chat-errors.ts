export type ChatErrorKind = "paused" | "quota" | "daily_limit" | "network" | "server" | "persist";

export interface ClassifiedChatError {
  kind: ChatErrorKind;
  message: string;
  retry: boolean;
}

const PERSIST_PREFIX = "Não consegui salvar";

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// O useChat lança com o corpo cru da resposta (409/429 em JSON) ou com o texto do error part.
export function classifyChatError(error: unknown): ClassifiedChatError {
  const raw = error instanceof Error ? error.message : String(error);
  const body = parseJson(raw);
  if (body) {
    if (typeof body["state"] === "string") {
      return { kind: "paused", message: "Um analista assumiu a conversa. Sua mensagem foi entregue a ele, e o assistente não responde por enquanto.", retry: false };
    }
    if (body["error"] === "quota_exceeded") {
      return { kind: "quota", message: "Você atingiu o limite de 30 mensagens desta sessão.", retry: false };
    }
    if (body["error"] === "daily_limit") {
      return { kind: "daily_limit", message: "O limite diário de respostas do assistente foi atingido. Tente amanhã ou fale com a TI.", retry: false };
    }
    if (typeof body["error"] === "string") return { kind: "server", message: body["error"], retry: false };
  }
  if (raw.startsWith(PERSIST_PREFIX)) return { kind: "persist", message: raw, retry: false };
  if (error instanceof TypeError || /failed to fetch|network|load failed/i.test(raw)) {
    return { kind: "network", message: "Não consegui falar com o servidor. Verifique sua conexão.", retry: true };
  }
  return { kind: "server", message: raw || "Algo deu errado. Tente novamente.", retry: true };
}
