import type { ConversationState, TicketDto } from "@nexo/domain";
import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { initialsOf } from "../../lib/format";
import type { Database } from "../db/client";
import { conversations, decisionTraces, messages, users } from "../db/schema";
import { TicketServiceUnavailableError } from "../tickets/ticket-errors";
import type { TicketGateway } from "../tickets/ticket-gateway";
import { badgeFor, type ConversationBadge } from "./console-badge";
import { listMessages } from "./conversation-repository";
import { toUiMessage, type UiMessage, type UiTrace } from "./ui-messages";

export const CONSOLE_FILTERS = ["all", "for_you", "with_agent", "mine"] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];

export interface ConsoleEmployee {
  id: string;
  name: string;
  initials: string;
  department: string;
}

export interface ConversationSummary {
  id: string;
  employee: ConsoleEmployee;
  state: ConversationState;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadForAnalyst: number;
  badge: ConversationBadge;
}

export interface ConsoleList {
  conversations: ConversationSummary[];
  counts: Record<ConsoleFilter, number>;
}

export interface ConsoleDetail {
  conversation: {
    id: string;
    state: ConversationState;
    assignedAnalystId: string | null;
    assignedAnalystName: string | null;
    createdAt: string;
    updatedAt: string;
  };
  employee: ConsoleEmployee;
  badge: ConversationBadge;
  handoff: { reason: string | null; summary: string | null; linkedTicketCode: string | null; trace: UiTrace | null };
  messages: UiMessage[];
  // null quando o serviço de chamados não respondeu; `ticketsError` traz o texto para a tela.
  tickets: TicketDto[] | null;
  ticketsError: string | null;
}

export const TICKETS_UNAVAILABLE_TEXT = "Não consegui carregar os chamados agora. O serviço de chamados está indisponível.";
const TICKETS_FAILED_TEXT = "Não consegui carregar os chamados agora.";

const PREVIEW_MAX = 140;

// `%`, `_` e `\` do texto digitado valem como letras comuns no ILIKE.
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const employeeOf = (row: { id: string; name: string; department: string }): ConsoleEmployee => ({
  id: row.id,
  name: row.name,
  initials: initialsOf(row.name),
  department: row.department,
});

function filterCondition(filter: ConsoleFilter, analystId: string): SQL | undefined {
  switch (filter) {
    case "for_you":
      return eq(conversations.state, "waiting_analyst");
    case "with_agent":
      return eq(conversations.state, "agent");
    case "mine":
      return and(eq(conversations.state, "analyst"), eq(conversations.assignedAnalystId, analystId));
    case "all":
      return undefined;
  }
}

async function countsFor(db: Database, analystId: string): Promise<Record<ConsoleFilter, number>> {
  const rows = await db
    .select({ state: conversations.state, assigned: conversations.assignedAnalystId, n: sql<number>`count(*)::int` })
    .from(conversations)
    .groupBy(conversations.state, conversations.assignedAnalystId);
  const counts: Record<ConsoleFilter, number> = { all: 0, for_you: 0, with_agent: 0, mine: 0 };
  for (const row of rows) {
    counts.all += row.n;
    if (row.state === "waiting_analyst") counts.for_you += row.n;
    if (row.state === "agent") counts.with_agent += row.n;
    if (row.state === "analyst" && row.assigned === analystId) counts.mine += row.n;
  }
  return counts;
}

export async function listConsoleConversations(
  db: Database,
  analystId: string,
  filter: ConsoleFilter,
  q: string,
): Promise<ConsoleList> {
  const analyst = alias(users, "analyst");
  const conditions: Array<SQL | undefined> = [filterCondition(filter, analystId)];
  const term = q.trim();
  if (term !== "") {
    const pattern = `%${escapeLike(term)}%`;
    conditions.push(
      or(
        ilike(users.name, pattern),
        sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id} and ${messages.content} ilike ${pattern})`,
      ),
    );
  }
  const rows = await db
    .select({
      id: conversations.id,
      state: conversations.state,
      handoffReason: conversations.handoffReason,
      linkedTicketCode: conversations.linkedTicketCode,
      updatedAt: conversations.updatedAt,
      employee: { id: users.id, name: users.name, department: users.department },
      analystName: analyst.name,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.employeeId))
    .leftJoin(analyst, eq(analyst.id, conversations.assignedAnalystId))
    .where(and(...conditions));

  const counts = await countsFor(db, analystId);
  if (rows.length === 0) return { conversations: [], counts };

  const ids = rows.map((r) => r.id);
  const lowConfidenceIds = rows.filter((r) => r.state === "waiting_analyst" && r.handoffReason === "low_confidence").map((r) => r.id);
  const lastAnalystAt = sql`coalesce((select max(a.created_at) from messages a where a.conversation_id = ${messages.conversationId} and a.author = 'analyst'), 'epoch'::timestamptz)`;

  const [lasts, unread, confidences] = await Promise.all([
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        author: messages.author,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(inArray(messages.conversationId, ids), ne(messages.author, "system"), ne(messages.content, "")))
      .orderBy(messages.conversationId, desc(messages.createdAt), desc(messages.id)),
    // Não lidas = mensagens do funcionário depois da última do analista (sem coluna nova no schema).
    db
      .select({ conversationId: messages.conversationId, n: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(inArray(messages.conversationId, ids), eq(messages.author, "employee"), sql`${messages.createdAt} > ${lastAnalystAt}`))
      .groupBy(messages.conversationId),
    lowConfidenceIds.length === 0
      ? Promise.resolve([])
      : db
          .selectDistinctOn([messages.conversationId], { conversationId: messages.conversationId, confidence: decisionTraces.confidence })
          .from(decisionTraces)
          .innerJoin(messages, eq(messages.id, decisionTraces.messageId))
          .where(inArray(messages.conversationId, lowConfidenceIds))
          .orderBy(messages.conversationId, desc(decisionTraces.createdAt)),
  ]);
  const lastBy = new Map(lasts.map((l) => [l.conversationId, l]));
  const unreadBy = new Map(unread.map((u) => [u.conversationId, u.n]));
  const confidenceBy = new Map(confidences.map((c) => [c.conversationId, c.confidence]));

  const summaries = rows.map((row): ConversationSummary => {
    const last = lastBy.get(row.id);
    const prefix = last?.author === "agent" ? "Nexo: " : last?.author === "analyst" ? "Analista: " : "";
    const text = last ? `${prefix}${last.content}` : "Sem mensagens";
    const paused = row.state === "waiting_analyst" || row.state === "analyst";
    return {
      id: row.id,
      employee: employeeOf(row.employee),
      state: row.state,
      lastMessagePreview: text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text,
      lastMessageAt: (last?.createdAt ?? row.updatedAt).toISOString(),
      unreadForAnalyst: paused ? (unreadBy.get(row.id) ?? 0) : 0,
      badge: badgeFor({
        state: row.state,
        handoffReason: row.handoffReason,
        linkedTicketCode: row.linkedTicketCode,
        confidence: confidenceBy.get(row.id) ?? null,
        analystName: row.analystName,
      }),
    };
  });

  const waitingSince = new Map(rows.map((r) => [r.id, r.updatedAt.getTime()]));
  summaries.sort((a, b) =>
    filter === "for_you"
      ? (waitingSince.get(a.id) ?? 0) - (waitingSince.get(b.id) ?? 0)
      : b.lastMessageAt.localeCompare(a.lastMessageAt),
  );
  return { conversations: summaries, counts };
}

async function loadTickets(
  gateway: TicketGateway,
  employeeId: string,
): Promise<{ tickets: TicketDto[] | null; ticketsError: string | null }> {
  try {
    return { tickets: await gateway.listMine(employeeId, "all"), ticketsError: null };
  } catch (error) {
    if (!(error instanceof TicketServiceUnavailableError)) {
      console.error("[console] chamados do funcionário:", error instanceof Error ? error.message : "erro desconhecido");
    }
    return { tickets: null, ticketsError: error instanceof TicketServiceUnavailableError ? TICKETS_UNAVAILABLE_TEXT : TICKETS_FAILED_TEXT };
  }
}

export async function loadConsoleDetail(db: Database, gateway: TicketGateway, id: string): Promise<ConsoleDetail | null> {
  const analyst = alias(users, "analyst");
  const [row] = await db
    .select({ conversation: conversations, employee: users, analystName: analyst.name })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.employeeId))
    .leftJoin(analyst, eq(analyst.id, conversations.assignedAnalystId))
    .where(eq(conversations.id, id));
  if (!row) return null;
  const { conversation } = row;

  const [stored, [latest], ticketResult] = await Promise.all([
    listMessages(db, id),
    db
      .select({ confidence: decisionTraces.confidence, trace: decisionTraces })
      .from(decisionTraces)
      .innerJoin(messages, eq(messages.id, decisionTraces.messageId))
      .where(eq(messages.conversationId, id))
      .orderBy(desc(decisionTraces.createdAt))
      .limit(1),
    loadTickets(gateway, conversation.employeeId),
  ]);
  const trace: UiTrace | null = latest
    ? {
        intent: latest.trace.intent,
        understanding: latest.trace.understanding,
        action: latest.trace.action,
        confidence: latest.trace.confidence,
        rationale: latest.trace.rationale,
        tools: latest.trace.tools,
        model: latest.trace.model,
        latencyMs: latest.trace.latencyMs,
      }
    : null;

  return {
    conversation: {
      id: conversation.id,
      state: conversation.state,
      assignedAnalystId: conversation.assignedAnalystId,
      assignedAnalystName: row.analystName,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    },
    employee: employeeOf(row.employee),
    badge: badgeFor({
      state: conversation.state,
      handoffReason: conversation.handoffReason,
      linkedTicketCode: conversation.linkedTicketCode,
      confidence: latest?.confidence ?? null,
      analystName: row.analystName,
    }),
    handoff: {
      reason: conversation.handoffReason,
      summary: conversation.handoffSummary,
      linkedTicketCode: conversation.linkedTicketCode,
      trace,
    },
    messages: stored.map(toUiMessage),
    ...ticketResult,
  };
}
