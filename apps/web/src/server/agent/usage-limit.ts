import { sql } from "drizzle-orm";
import { getDb } from "../db/app-db";
import type { Database } from "../db/client";
import { dailyUsage } from "../db/schema";

export function saoPauloDay(now: Date): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

// Teto de turnos com o modelo por dia (data de America/Sao_Paulo), contado em daily_usage.
export class DailyUsageLimit {
  constructor(
    private readonly limit: number,
    private readonly db: Database = getDb(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Incremento atômico e condicional (upsert): devolve false, sem incrementar, quando o dia já está no teto.
  async consume(): Promise<boolean> {
    const day = saoPauloDay(this.now());
    const rows = await this.db
      .insert(dailyUsage)
      .values({ day, llmTurns: 1 })
      .onConflictDoUpdate({
        target: dailyUsage.day,
        set: { llmTurns: sql`${dailyUsage.llmTurns} + 1` },
        setWhere: sql`${dailyUsage.llmTurns} < ${this.limit}`,
      })
      .returning({ turns: dailyUsage.llmTurns });
    return rows.length > 0;
  }

  // Devolve um turno consumido que não chegou ao modelo.
  async refund(): Promise<void> {
    const day = saoPauloDay(this.now());
    await this.db
      .update(dailyUsage)
      .set({ llmTurns: sql`greatest(${dailyUsage.llmTurns} - 1, 0)` })
      .where(sql`${dailyUsage.day} = ${day}`);
  }
}
