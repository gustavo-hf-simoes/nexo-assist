import { CONVERSATION_STATES } from "@nexo/domain";
import { sql } from "drizzle-orm";
import {
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["employee", "analyst"] }).notNull(),
  department: text("department").notNull(),
  deviceModel: text("device_model"),
  deviceOs: text("device_os"),
});

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  messagesSent: integer("messages_sent").notNull().default(0),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: text("employee_id")
      .notNull()
      .references(() => users.id),
    state: text("state", { enum: CONVERSATION_STATES }).notNull().default("agent"),
    assignedAnalystId: text("assigned_analyst_id").references(() => users.id),
    handoffReason: text("handoff_reason"),
    handoffSummary: text("handoff_summary"),
    linkedTicketCode: text("linked_ticket_code"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_employee_idx").on(t.employeeId),
    // No máximo uma conversa aberta por funcionário; fecha a corrida do getOrCreateCurrent.
    uniqueIndex("conversations_one_open_per_employee")
      .on(t.employeeId)
      .where(sql`${t.state} <> 'closed'`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    author: text("author", { enum: ["employee", "agent", "analyst", "system"] }).notNull(),
    authorId: text("author_id"),
    content: text("content").notNull(),
    parts: jsonb("parts"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const decisionTraces = pgTable("decision_traces", {
  messageId: uuid("message_id")
    .primaryKey()
    .references(() => messages.id),
  intent: text("intent").notNull(),
  understanding: text("understanding").notNull(),
  action: text("action").notNull(),
  confidence: real("confidence"),
  rationale: text("rationale").notNull(),
  tools: jsonb("tools").notNull(),
  model: text("model").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: createdAt(),
});

export const ticketDrafts = pgTable(
  "ticket_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayCode: text("display_code").notNull().unique(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    employeeId: text("employee_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: ["create", "update", "reopen"] }).notNull(),
    targetTicketCode: text("target_ticket_code"),
    payload: jsonb("payload").notNull(),
    status: text("status", {
      enum: ["pending", "confirming", "confirmed", "cancelled", "superseded", "failed"],
    })
      .notNull()
      .default("pending"),
    ticketCode: text("ticket_code"),
    // Quando entrou em `confirming`; permite retomar uma confirmação que ficou presa (crash/erro).
    confirmingSince: timestamp("confirming_since", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("ticket_drafts_conversation_idx").on(t.conversationId)],
);

export const kbArticles = pgTable(
  "kb_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // array_to_string não é imutável, então as tags ficam fora do índice de busca.
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') || setweight(to_tsvector('portuguese', coalesce(body, '')), 'B')`,
    ),
  },
  (t) => [index("kb_articles_search_idx").using("gin", t.search)],
);

export const dailyUsage = pgTable("daily_usage", {
  day: date("day").primaryKey(),
  llmTurns: integer("llm_turns").notNull().default(0),
});
