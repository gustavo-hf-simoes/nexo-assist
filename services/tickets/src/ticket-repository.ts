import {
  canReopen,
  classifyPriority,
  isOpenStatus,
  TICKET_STATUSES,
  type CreateTicketInput,
  type TicketDto,
  type TransferInput,
} from "@nexo/domain";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./db/client";
import { idempotencyKeys, ticketEvents, tickets, type TicketRow } from "./db/schema";
import {
  IdempotencyKeyConflictError,
  ReopenWindowExpiredError,
  TicketNotFoundError,
  TicketNotResolvedError,
} from "./errors";

// O solicitante vem da identidade autenticada, nunca do corpo da requisição.
export type NewTicket = CreateTicketInput & { requesterId: string };
export type TicketScope = "open" | "all";

export interface TicketRepository {
  listByRequester(requesterId: string, scope: TicketScope): Promise<TicketDto[]>;
  findByCode(code: string, requesterId: string): Promise<TicketDto | null>;
  create(
    input: NewTicket,
    idempotencyKey: string,
  ): Promise<{ ticket: TicketDto; replayed: boolean }>;
  addComment(
    code: string,
    requesterId: string,
    body: string,
    idempotencyKey: string,
  ): Promise<TicketDto>;
  reopen(code: string, requesterId: string, now: Date): Promise<TicketDto>;
  transfer(
    code: string,
    requesterId: string,
    input: TransferInput,
    idempotencyKey: string,
  ): Promise<TicketDto>;
}

const OPEN_STATUSES = TICKET_STATUSES.filter(isOpenStatus);

export function toDto(row: TicketRow): TicketDto {
  return {
    code: row.code,
    type: row.type as TicketDto["type"],
    category: row.category as TicketDto["category"],
    priority: row.priority as TicketDto["priority"],
    status: row.status as TicketDto["status"],
    title: row.title,
    description: row.description,
    affected: row.affected as TicketDto["affected"],
    requesterId: row.requesterId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastSupportUpdateAt: row.lastSupportUpdateAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export class DrizzleTicketRepository implements TicketRepository {
  constructor(private readonly db: Database) {}

  async listByRequester(requesterId: string, scope: TicketScope): Promise<TicketDto[]> {
    const where =
      scope === "open"
        ? and(eq(tickets.requesterId, requesterId), inArray(tickets.status, OPEN_STATUSES))
        : eq(tickets.requesterId, requesterId);
    const rows = await this.db.select().from(tickets).where(where).orderBy(desc(tickets.createdAt));
    return rows.map(toDto);
  }

  async findByCode(code: string, requesterId: string): Promise<TicketDto | null> {
    const [row] = await this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.code, code), eq(tickets.requesterId, requesterId)));
    return row ? toDto(row) : null;
  }

  async create(
    input: NewTicket,
    idempotencyKey: string,
  ): Promise<{ ticket: TicketDto; replayed: boolean }> {
    const { priority } = classifyPriority({
      type: input.type,
      impact: input.affected,
      blocksWork: input.blocksWork,
      sameDayDeadline: input.sameDayDeadline,
    });
    return this.db.transaction(async (tx) => {
      const sequence = input.type === "INC" ? "inc_seq" : "req_seq";
      const next = await tx.execute<{ n: string }>(
        sql`SELECT nextval(${sequence}::regclass)::text AS n`,
      );
      const code = `${input.type}-${next.rows[0]?.n ?? ""}`;

      // Se a chave já existe (inclusive numa transação concorrente, que bloqueia aqui
      // até o commit), nada é inserido e devolvemos o chamado original.
      const claimed = await tx
        .insert(idempotencyKeys)
        .values({ key: idempotencyKey, ticketCode: code, requesterId: input.requesterId })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (claimed.length === 0) {
        const [existing] = await tx
          .select({ ticket: tickets })
          .from(idempotencyKeys)
          .innerJoin(tickets, eq(tickets.code, idempotencyKeys.ticketCode))
          .where(eq(idempotencyKeys.key, idempotencyKey));
        if (!existing) throw new Error("Chave de idempotência sem chamado associado.");
        // Chave de outro solicitante: conflito, sem devolver dados do chamado alheio.
        if (existing.ticket.requesterId !== input.requesterId)
          throw new IdempotencyKeyConflictError();
        return { ticket: toDto(existing.ticket), replayed: true };
      }

      const [row] = await tx
        .insert(tickets)
        .values({
          code,
          type: input.type,
          category: input.category,
          priority,
          status: "aberto",
          title: input.title,
          description: input.description,
          affected: input.affected,
          requesterId: input.requesterId,
        })
        .returning();
      if (!row) throw new Error("Falha ao inserir o chamado.");
      return { ticket: toDto(row), replayed: false };
    });
  }

  async addComment(
    code: string,
    requesterId: string,
    body: string,
    idempotencyKey: string,
  ): Promise<TicketDto> {
    return this.db.transaction(async (tx) => {
      const ticket = await this.lockOwned(tx, code, requesterId);
      const inserted = await tx
        .insert(ticketEvents)
        .values({ ticketCode: code, kind: "comment", actor: requesterId, body, idempotencyKey })
        .onConflictDoNothing()
        .returning({ id: ticketEvents.id });
      if (inserted.length === 0) return toDto(ticket);
      const [updated] = await tx
        .update(tickets)
        .set({ updatedAt: new Date() })
        .where(eq(tickets.code, code))
        .returning();
      return toDto(updated ?? ticket);
    });
  }

  async reopen(code: string, requesterId: string, now: Date): Promise<TicketDto> {
    return this.db.transaction(async (tx) => {
      const ticket = await this.lockOwned(tx, code, requesterId);
      const dto = toDto(ticket);
      if (dto.status !== "resolvido") throw new TicketNotResolvedError(code);
      if (!canReopen(dto, now)) throw new ReopenWindowExpiredError(code);
      const [updated] = await tx
        .update(tickets)
        .set({ status: "aberto", resolvedAt: null, updatedAt: now })
        .where(eq(tickets.code, code))
        .returning();
      await tx.insert(ticketEvents).values({
        ticketCode: code,
        kind: "reopen",
        actor: requesterId,
        metadata: { from: "resolvido", to: "aberto" },
        createdAt: now,
      });
      return toDto(updated ?? ticket);
    });
  }

  async transfer(
    code: string,
    requesterId: string,
    input: TransferInput,
    idempotencyKey: string,
  ): Promise<TicketDto> {
    return this.db.transaction(async (tx) => {
      const ticket = await this.lockOwned(tx, code, requesterId);
      const inserted = await tx
        .insert(ticketEvents)
        .values({
          ticketCode: code,
          kind: "transfer",
          actor: requesterId,
          body: input.summary,
          metadata: { queue: input.queue },
          idempotencyKey,
        })
        .onConflictDoNothing()
        .returning({ id: ticketEvents.id });
      if (inserted.length === 0) return toDto(ticket);
      const [updated] = await tx
        .update(tickets)
        .set({ status: "aguardando_analista", updatedAt: new Date() })
        .where(eq(tickets.code, code))
        .returning();
      return toDto(updated ?? ticket);
    });
  }

  // Seleciona o chamado do próprio usuário com lock de linha; senão, "não encontrado".
  private async lockOwned(
    tx: Pick<Database, "select">,
    code: string,
    requesterId: string,
  ): Promise<TicketRow> {
    const [row] = await tx
      .select()
      .from(tickets)
      .where(and(eq(tickets.code, code), eq(tickets.requesterId, requesterId)))
      .for("update");
    if (!row) throw new TicketNotFoundError(code);
    return row;
  }
}
