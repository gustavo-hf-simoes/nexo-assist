import type { ConversationState } from "@nexo/domain";
import { and, desc, eq, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { conversations, messages, users } from "../db/schema";

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Tx;

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageAuthor = (typeof messages.$inferSelect)["author"];

export interface NewMessage {
  author: MessageAuthor;
  authorId?: string;
  content: string;
  parts?: unknown;
}

export interface HistoryRow {
  author: MessageAuthor;
  content: string;
  analystName: string | null;
}

export interface ConversationPatch {
  assignedAnalystId?: string;
  handoffReason?: string;
  handoffSummary?: string;
}

export class ConversationRepository {
  constructor(private readonly db: Database) {}

  async findCurrent(employeeId: string): Promise<ConversationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.employeeId, employeeId), ne(conversations.state, "closed")))
      .orderBy(desc(conversations.createdAt))
      .limit(1);
    return row;
  }

  async create(employeeId: string): Promise<ConversationRow> {
    const [row] = await this.db.insert(conversations).values({ employeeId }).returning();
    if (!row) throw new Error("Falha ao criar a conversa.");
    return row;
  }

  async findById(id: string, ex: Executor = this.db): Promise<ConversationRow | undefined> {
    const [row] = await ex.select().from(conversations).where(eq(conversations.id, id));
    return row;
  }

  // Concorrência: só atualiza se o estado ainda for o esperado; devolve false em conflito.
  async updateState(
    id: string,
    expected: ConversationState,
    next: ConversationState,
    patch: ConversationPatch,
    ex: Executor,
  ): Promise<boolean> {
    const rows = await ex
      .update(conversations)
      .set({ ...patch, state: next, updatedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.state, expected)))
      .returning({ id: conversations.id });
    return rows.length > 0;
  }

  async insertMessage(conversationId: string, msg: NewMessage, ex: Executor = this.db): Promise<void> {
    await ex.insert(messages).values({
      conversationId,
      author: msg.author,
      authorId: msg.authorId ?? null,
      content: msg.content,
      parts: msg.parts ?? null,
    });
  }

  async userName(id: string, ex: Executor): Promise<string | undefined> {
    const [row] = await ex.select({ name: users.name }).from(users).where(eq(users.id, id));
    return row?.name;
  }

  // Sem mensagens de sistema, para o limite contar só o que o modelo vê. Mais recentes primeiro; o serviço inverte para a ordem cronológica.
  async recentMessages(conversationId: string, limit: number): Promise<HistoryRow[]> {
    return this.db
      .select({ author: messages.author, content: messages.content, analystName: users.name })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(and(eq(messages.conversationId, conversationId), ne(messages.author, "system")))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit);
  }
}
