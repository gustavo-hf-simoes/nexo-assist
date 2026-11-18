import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { isUniqueViolation } from "../db/pg-errors";
import { ticketDrafts } from "../db/schema";
import type { DraftPayload, DraftStatus, NewDraftInput } from "./draft-types";

export type DraftRow = Omit<typeof ticketDrafts.$inferSelect, "payload"> & { payload: DraftPayload };

const MAX_CODE_ATTEMPTS = 5;
const FIRST_DISPLAY_NUMBER = 381;

function asRow(row: typeof ticketDrafts.$inferSelect): DraftRow {
  return { ...row, payload: row.payload as DraftPayload };
}

export class DraftRepository {
  constructor(private readonly db: Database) {}

  // Substitui os pending da conversa e insere o novo, na mesma transação. O código "D-n" é max+1
  // calculado no INSERT; se duas inserções simultâneas escolherem o mesmo número, a restrição
  // UNIQUE rejeita uma delas e a transação inteira é repetida.
  async insertSupersedingPending(input: NewDraftInput): Promise<DraftRow> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.db.transaction(async (tx) => {
          await tx
            .update(ticketDrafts)
            .set({ status: "superseded" })
            .where(and(eq(ticketDrafts.conversationId, input.conversationId), eq(ticketDrafts.status, "pending")));
          const [row] = await tx
            .insert(ticketDrafts)
            .values({
              displayCode: sql`(select 'D-' || (coalesce(max(substring(display_code from 3)::int), ${FIRST_DISPLAY_NUMBER - 1}) + 1) from ticket_drafts)`,
              conversationId: input.conversationId,
              employeeId: input.employeeId,
              kind: input.kind,
              targetTicketCode: input.targetTicketCode ?? null,
              payload: input.payload,
            })
            .returning();
          if (!row) throw new Error("Falha ao inserir o rascunho.");
          return asRow(row);
        });
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_CODE_ATTEMPTS) throw error;
      }
    }
  }

  async listByConversation(conversationId: string, employeeId: string): Promise<DraftRow[]> {
    const rows = await this.db
      .select()
      .from(ticketDrafts)
      .where(and(eq(ticketDrafts.conversationId, conversationId), eq(ticketDrafts.employeeId, employeeId)))
      .orderBy(ticketDrafts.createdAt, ticketDrafts.displayCode);
    return rows.map(asRow);
  }

  async findById(id: string): Promise<DraftRow | null> {
    const [row] = await this.db.select().from(ticketDrafts).where(eq(ticketDrafts.id, id));
    return row ? asRow(row) : null;
  }

  // pending -> to, só se o rascunho for do funcionário e ainda estiver pending (UPDATE ... RETURNING atômico).
  async transitionFromPending(
    id: string,
    employeeId: string,
    to: Extract<DraftStatus, "confirming" | "cancelled">,
  ): Promise<DraftRow | null> {
    const [row] = await this.db
      .update(ticketDrafts)
      .set({ status: to, ...(to === "confirming" ? { confirmingSince: new Date() } : {}) })
      .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.employeeId, employeeId), eq(ticketDrafts.status, "pending")))
      .returning();
    return row ? asRow(row) : null;
  }

  // Retoma um rascunho preso em `confirming` há mais de `staleMs` (UPDATE ... RETURNING atômico: só um
  // retry ganha). Devolve o rascunho para reenviar com a mesma Idempotency-Key.
  async reclaimStaleConfirming(id: string, employeeId: string, staleMs: number): Promise<DraftRow | null> {
    const now = new Date();
    const [row] = await this.db
      .update(ticketDrafts)
      .set({ confirmingSince: now })
      .where(
        and(
          eq(ticketDrafts.id, id),
          eq(ticketDrafts.employeeId, employeeId),
          eq(ticketDrafts.status, "confirming"),
          lt(ticketDrafts.confirmingSince, new Date(now.getTime() - staleMs)),
        ),
      )
      .returning();
    return row ? asRow(row) : null;
  }

  async finishConfirming(id: string, to: Extract<DraftStatus, "confirmed" | "pending" | "failed">, ticketCode?: string): Promise<void> {
    await this.db
      .update(ticketDrafts)
      .set({ status: to, ...(ticketCode === undefined ? {} : { ticketCode }) })
      .where(and(eq(ticketDrafts.id, id), eq(ticketDrafts.status, "confirming")));
  }
}
