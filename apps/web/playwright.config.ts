import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Valores só de teste. Localmente o Postgres do docker-compose fica na porta 5433 do host;
// no CI as variáveis vêm do job (porta 5432) e têm precedência.
const DB_PORT = process.env["E2E_DB_PORT"] ?? "5433";
const APP_DATABASE_URL = process.env["APP_DATABASE_URL"] ?? `postgres://nexo:nexo_dev@127.0.0.1:${DB_PORT}/nexo_app`;
const TICKETS_DATABASE_URL = process.env["TICKETS_DATABASE_URL"] ?? `postgres://nexo:nexo_dev@127.0.0.1:${DB_PORT}/nexo_tickets`;
const TICKET_SERVICE_TOKEN = process.env["TICKET_SERVICE_TOKEN"] ?? "e2e-ticket-token-not-a-secret-0123456789";
const SESSION_SECRET = process.env["SESSION_SECRET"] ?? "e2e-session-secret-not-a-secret-0123456789abcdef";
const TICKETS_PORT = "4010";
const WEB_PORT = process.env["E2E_WEB_PORT"] ?? "3100";

// Mesmas variáveis para o setup, o serviço de chamados e o Next.
export const e2eEnv: Record<string, string> = {
  APP_DATABASE_URL,
  TICKETS_DATABASE_URL,
  TICKET_SERVICE_URL: `http://localhost:${TICKETS_PORT}`,
  TICKET_SERVICE_TOKEN,
  TICKET_SERVICE_FAILURE_RATE: "0",
  TICKET_SERVICE_LATENCY_MS: "0",
  PORT: TICKETS_PORT,
  SESSION_SECRET,
  NEXO_AGENT_MODEL: "test/scripted",
  GOOGLE_GENERATIVE_AI_API_KEY: "e2e-key-not-a-secret",
  AGENT_MIN_CONFIDENCE: "0.6",
  SESSION_MESSAGE_LIMIT: "30",
  DAILY_LLM_TURN_LIMIT: "500",
};

const webDir = fileURLToPath(new URL(".", import.meta.url));
const ticketsDir = fileURLToPath(new URL("../../services/tickets", import.meta.url));
const baseURL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // O primeiro acesso a cada rota compila no next dev: folga generosa.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, locale: "pt-BR", timezoneId: "America/Sao_Paulo", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "tickets",
      command: "npx tsx src/index.ts",
      cwd: ticketsDir,
      url: `http://localhost:${TICKETS_PORT}/health`,
      env: e2eEnv,
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
    },
    {
      name: "web",
      command: `npx next dev --port ${WEB_PORT}`,
      cwd: webDir,
      url: `${baseURL}/login`,
      env: e2eEnv,
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
    },
  ],
});
