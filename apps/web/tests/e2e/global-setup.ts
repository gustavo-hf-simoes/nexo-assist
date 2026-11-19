import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { e2eEnv } from "../../playwright.config";
import { assertLocalDatabaseUrl } from "./local-db-guard";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

// Único usuário que o E2E usa. Só os dados dele são apagados; a Ana e o resto do seed não são tocados.
export const E2E_USER_ID = "diego.ramos";

async function withClient(url: string, run: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

// Zera o estado do usuário do E2E para o teste poder rodar de novo no mesmo banco
// (cota de 30 mensagens, histórico, rascunhos, rastros e chamados criados por ele).
async function resetE2eUser(): Promise<void> {
  await withClient(e2eEnv["APP_DATABASE_URL"] ?? "", async (db) => {
    await db.query("BEGIN");
    const owned = "SELECT id FROM conversations WHERE employee_id = $1";
    await db.query(`DELETE FROM decision_traces WHERE message_id IN (SELECT id FROM messages WHERE conversation_id IN (${owned}))`, [E2E_USER_ID]);
    await db.query(`DELETE FROM ticket_drafts WHERE conversation_id IN (${owned}) OR employee_id = $1`, [E2E_USER_ID]);
    await db.query(`DELETE FROM messages WHERE conversation_id IN (${owned})`, [E2E_USER_ID]);
    await db.query("DELETE FROM conversations WHERE employee_id = $1", [E2E_USER_ID]);
    await db.query("DELETE FROM auth_sessions WHERE user_id = $1", [E2E_USER_ID]);
    await db.query("COMMIT");
  });
  await withClient(e2eEnv["TICKETS_DATABASE_URL"] ?? "", async (db) => {
    await db.query("BEGIN");
    await db.query("DELETE FROM idempotency_keys WHERE requester_id = $1", [E2E_USER_ID]);
    await db.query("DELETE FROM tickets WHERE requester_id = $1", [E2E_USER_ID]); // eventos saem em cascata
    await db.query("COMMIT");
  });
}

// Conversa da Ana do seed e as mensagens que o seed cria nela (a 2 tem o trace de "por que transferiu").
const ANA_CONVERSATION_ID = "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0a0001";
const ANA_SEED_MESSAGE_IDS = [1, 2, 3].map((n) => `7c2d8e10-5a4b-4f6c-8b21-${String(n).padStart(12, "0")}`);
export const ANALYST_USER_IDS = ["rafael.lima", "julia.castro"];

// O console do analista assume, responde e devolve a conversa da Ana. Para o E2E rodar de novo no mesmo banco,
// volta à Ana do seed: apaga mensagens e traces que o teste criou, restaura o estado e some com o responsável.
async function resetAnaConversation(): Promise<void> {
  await withClient(e2eEnv["APP_DATABASE_URL"] ?? "", async (db) => {
    await db.query("BEGIN");
    const extra = "SELECT id FROM messages WHERE conversation_id = $1 AND id <> ALL($2::uuid[])";
    const args = [ANA_CONVERSATION_ID, ANA_SEED_MESSAGE_IDS];
    await db.query(`DELETE FROM decision_traces WHERE message_id IN (${extra})`, args);
    await db.query("DELETE FROM messages WHERE conversation_id = $1 AND id <> ALL($2::uuid[])", args);
    await db.query(
      "UPDATE conversations SET state = 'waiting_analyst', assigned_analyst_id = NULL, updated_at = now() - interval '28 hours' WHERE id = $1",
      [ANA_CONVERSATION_ID],
    );
    await db.query("DELETE FROM auth_sessions WHERE user_id = ANY($1::text[])", [ANALYST_USER_IDS]);
    await db.query("COMMIT");
  });
}

// Migra e popula os dois bancos (idempotente), zera o usuário do E2E e só então os servidores sobem.
export default async function globalSetup(): Promise<void> {
  assertLocalDatabaseUrl("APP_DATABASE_URL", e2eEnv["APP_DATABASE_URL"] ?? "");
  assertLocalDatabaseUrl("TICKETS_DATABASE_URL", e2eEnv["TICKETS_DATABASE_URL"] ?? "");
  for (const workspace of ["@nexo/tickets", "@nexo/web"]) {
    for (const script of ["db:migrate", "db:seed"]) {
      execSync(`npm run ${script} -w ${workspace}`, { cwd: root, env: { ...process.env, ...e2eEnv }, stdio: "inherit" });
    }
  }
  await resetE2eUser();
  await resetAnaConversation();
}
