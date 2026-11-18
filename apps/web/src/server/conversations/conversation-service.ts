import type { ModelMessage } from "ai";
import { getDb } from "../db/app-db";
import type { Database } from "../db/client";
import {
  ConversationRepository,
  type ConversationPatch,
  type ConversationRow,
  type Executor,
  type NewMessage,
} from "./conversation-repository";
import { transition, type ConversationEvent } from "./conversation-state";
import { InvalidTransitionError } from "./errors";

export class ConversationService {
  private readonly repo: ConversationRepository;

  constructor(private readonly db: Database = getDb()) {
    this.repo = new ConversationRepository(db);
  }

  async getOrCreateCurrent(employeeId: string): Promise<ConversationRow> {
    return (await this.repo.findCurrent(employeeId)) ?? this.repo.create(employeeId);
  }

  async appendMessage(conversationId: string, msg: NewMessage): Promise<void> {
    await this.repo.insertMessage(conversationId, msg);
  }

  // Muda o estado e grava a mensagem de sistema na mesma transação.
  async apply(conversationId: string, event: ConversationEvent): Promise<ConversationRow> {
    return this.db.transaction(async (tx) => {
      const current = await this.repo.findById(conversationId, tx);
      if (!current) throw new InvalidTransitionError("Conversa não encontrada.");
      const next = transition(current.state, event);
      const patch = this.patchFor(event);
      const updated = await this.repo.updateState(conversationId, current.state, next, patch, tx);
      if (!updated) throw new InvalidTransitionError("A conversa mudou de estado antes desta operação.");
      const text = await this.systemText(event, tx);
      await this.repo.insertMessage(conversationId, { author: "system", content: text }, tx);
      return { ...current, ...patch, state: next };
    });
  }

  async history(conversationId: string, limit = 20): Promise<ModelMessage[]> {
    const rows = await this.repo.recentMessages(conversationId, limit);
    const out: ModelMessage[] = [];
    for (const row of rows.reverse()) {
      if (row.author === "employee") out.push({ role: "user", content: row.content });
      else if (row.author === "agent") out.push({ role: "assistant", content: row.content });
      else out.push({ role: "assistant", content: `[Analista ${row.analystName ?? "N2"}] ${row.content}` });
    }
    return out;
  }

  private patchFor(event: ConversationEvent): ConversationPatch {
    if (event.type === "handoff") return { handoffReason: event.reason, handoffSummary: event.summary };
    if (event.type === "assume") return { assignedAnalystId: event.analystId };
    return {};
  }

  private async systemText(event: ConversationEvent, ex: Executor): Promise<string> {
    switch (event.type) {
      case "handoff":
        return "Transferida para Suporte N2";
      case "assume":
        return `${(await this.repo.userName(event.analystId, ex)) ?? "Analista"} assumiu a conversa`;
      case "return_to_agent":
        return "Conversa devolvida ao assistente";
      case "close":
        return "Conversa encerrada";
    }
  }
}
