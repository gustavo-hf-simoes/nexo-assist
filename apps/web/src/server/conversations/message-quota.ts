import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db/app-db";
import type { Database } from "../db/client";
import { authSessions } from "../db/schema";
import { QuotaExceededError } from "./errors";

export const MESSAGE_LIMIT = 30;

export interface QuotaUsage {
  used: number;
  limit: number;
}

// Cota por sessão de autenticação (sid), contada em auth_sessions.messages_sent.
export class MessageQuota {
  constructor(
    private readonly db: Database = getDb(),
    private readonly limit: number = MESSAGE_LIMIT,
  ) {}

  async consume(sessionId: string): Promise<QuotaUsage> {
    // Incremento atômico e condicional: nunca passa do limite, mesmo com chamadas concorrentes.
    const [row] = await this.db
      .update(authSessions)
      .set({ messagesSent: sql`${authSessions.messagesSent} + 1` })
      .where(and(eq(authSessions.id, sessionId), lt(authSessions.messagesSent, this.limit)))
      .returning({ used: authSessions.messagesSent });
    if (row) return { used: row.used, limit: this.limit };
    await this.peek(sessionId); // sessão inexistente lança aqui
    throw new QuotaExceededError();
  }

  async peek(sessionId: string): Promise<QuotaUsage> {
    const [row] = await this.db
      .select({ used: authSessions.messagesSent })
      .from(authSessions)
      .where(eq(authSessions.id, sessionId));
    if (!row) throw new Error("Sessão não encontrada.");
    return { used: row.used, limit: this.limit };
  }
}
