import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { e2eEnv } from "../../playwright.config";

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

// Migra e popula os dois bancos (idempotente), zera o usuário do E2E e só então os servidores sobem.
export default async function globalSetup(): Promise<void> {
  for (const workspace of ["@nexo/tickets", "@nexo/web"]) {
    for (const script of ["db:migrate", "db:seed"]) {
      execSync(`npm run ${script} -w ${workspace}`, { cwd: root, env: { ...process.env, ...e2eEnv }, stdio: "inherit" });
    }
  }
  await resetE2eUser();
}
