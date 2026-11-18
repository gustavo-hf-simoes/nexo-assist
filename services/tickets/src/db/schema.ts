import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgSequence,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const incSeq = pgSequence("inc_seq", { startWith: 20520 });
export const reqSeq = pgSequence("req_seq", { startWith: 10450 });

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const tickets = pgTable(
  "tickets",
  {
    code: text("code").primaryKey(),
    type: text("type").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    affected: text("affected").notNull(),
    requesterId: text("requester_id").notNull(),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
    updatedAt: timestamptz("updated_at").notNull().default(sql`now()`),
    lastSupportUpdateAt: timestamptz("last_support_update_at"),
    resolvedAt: timestamptz("resolved_at"),
  },
  (t) => [index("tickets_requester_idx").on(t.requesterId, t.status)],
);

// Comentários, mudanças de status, reaberturas e transferências.
export const ticketEvents = pgTable(
  "ticket_events",
  {
    id: serial("id").primaryKey(),
    ticketCode: text("ticket_code")
      .notNull()
      .references(() => tickets.code, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actor: text("actor").notNull(),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, string>>(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamptz("created_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("ticket_events_ticket_idx").on(t.ticketCode),
    uniqueIndex("ticket_events_idempotency_key_uq").on(t.idempotencyKey),
  ],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  ticketCode: text("ticket_code").notNull(),
  createdAt: timestamptz("created_at").notNull().default(sql`now()`),
});

export type TicketRow = typeof tickets.$inferSelect;
export type TicketInsert = typeof tickets.$inferInsert;
