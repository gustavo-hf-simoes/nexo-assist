import { inArray, sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./config/env";
import { createDb, type Database } from "./db/client";
import { ticketEvents, tickets, type TicketInsert } from "./db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildSeedTickets(now: Date): TicketInsert[] {
  const ago = (days: number): Date => new Date(now.getTime() - days * DAY_MS);
  const base = { affected: "individual" } as const;
  return [
    {
      ...base,
      code: "INC-20311",
      type: "INC",
      category: "Hardware",
      priority: "media",
      status: "aguardando_analista",
      title: "Notebook lento após atualização do Windows",
      description: "O notebook ficou muito lento depois da última atualização do Windows.",
      requesterId: "ana.souza",
      createdAt: ago(9),
      updatedAt: ago(6),
      lastSupportUpdateAt: ago(6),
    },
    {
      ...base,
      code: "REQ-10442",
      type: "REQ",
      category: "Hardware",
      priority: "baixa",
      status: "aprovado",
      title: "Segundo monitor para home office",
      description: "Solicito um segundo monitor para trabalhar em casa.",
      requesterId: "ana.souza",
      createdAt: ago(8),
      updatedAt: ago(7),
      lastSupportUpdateAt: ago(7),
    },
    {
      ...base,
      code: "INC-20150",
      type: "INC",
      category: "Acesso",
      priority: "media",
      status: "resolvido",
      title: "Senha do SAP bloqueada",
      description: "A senha do SAP foi bloqueada após tentativas de acesso.",
      requesterId: "ana.souza",
      createdAt: ago(6),
      updatedAt: ago(4),
      lastSupportUpdateAt: ago(4),
      resolvedAt: ago(4),
    },
    {
      ...base,
      code: "INC-20298",
      type: "INC",
      category: "Acesso",
      priority: "media",
      status: "em_andamento",
      title: "Acesso à pasta Financeiro no SharePoint",
      description: "Preciso de acesso à pasta Financeiro no SharePoint.",
      requesterId: "ana.souza",
      createdAt: ago(3),
      updatedAt: ago(1),
      lastSupportUpdateAt: ago(1),
    },
    {
      ...base,
      code: "INC-19877",
      type: "INC",
      category: "E-mail",
      priority: "media",
      status: "resolvido",
      title: "Outlook não sincroniza no celular",
      description: "O Outlook parou de sincronizar os e-mails no celular.",
      requesterId: "ana.souza",
      createdAt: ago(25),
      updatedAt: ago(20),
      lastSupportUpdateAt: ago(20),
      resolvedAt: ago(20),
    },
    {
      ...base,
      code: "INC-20420",
      type: "INC",
      category: "Rede e VPN",
      priority: "alta",
      status: "aberto",
      title: "VPN cai a cada 10 minutos",
      description: "A conexão da VPN cai a cada 10 minutos.",
      requesterId: "carla.mendes",
      createdAt: ago(1),
      updatedAt: ago(1),
      lastSupportUpdateAt: null,
      resolvedAt: null,
    },
    {
      ...base,
      code: "REQ-10431",
      type: "REQ",
      category: "Acesso",
      priority: "baixa",
      status: "aberto",
      title: "Acesso ao SAP módulo FI",
      description: "Solicito acesso ao módulo FI do SAP.",
      requesterId: "carla.mendes",
      createdAt: ago(2),
      updatedAt: ago(2),
      lastSupportUpdateAt: null,
      resolvedAt: null,
    },
  ];
}

// Idempotente: upsert por código; eventos dos chamados de exemplo são recriados do zero.
// Os códigos fixos ficam abaixo do início das sequences (inc_seq 20520, req_seq 10450).
export async function seedTickets(db: Database, now: Date = new Date()): Promise<void> {
  const rows = buildSeedTickets(now);
  const codes = rows.map((r) => r.code);
  await db.transaction(async (tx) => {
    await tx.delete(ticketEvents).where(inArray(ticketEvents.ticketCode, codes));
    await tx
      .insert(tickets)
      .values(rows)
      .onConflictDoUpdate({
        target: tickets.code,
        set: {
          type: sql`excluded.type`,
          category: sql`excluded.category`,
          priority: sql`excluded.priority`,
          status: sql`excluded.status`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          affected: sql`excluded.affected`,
          requesterId: sql`excluded.requester_id`,
          createdAt: sql`excluded.created_at`,
          updatedAt: sql`excluded.updated_at`,
          lastSupportUpdateAt: sql`excluded.last_support_update_at`,
          resolvedAt: sql`excluded.resolved_at`,
        },
      });
  });
}

async function main(): Promise<void> {
  const { db, pool } = createDb(loadEnv().TICKETS_DATABASE_URL);
  try {
    await seedTickets(db);
    console.log("Dados de exemplo gravados.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
