import { afterAll, describe, expect, it } from "vitest";
import { createServerApp } from "../src/server-app";

const { app, pool } = createServerApp({
  TICKETS_DATABASE_URL: "postgres://nexo:nexo_dev@localhost:5432/nexo_tickets",
  TICKET_SERVICE_TOKEN: "token",
  DB_POOL_MAX: "3",
});

afterAll(async () => {
  await pool.end();
});

describe("createServerApp", () => {
  it("monta o app a partir do env sem abrir conexão: /health responde e o resto exige o token", async () => {
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/tickets?requesterId=ana.souza")).status).toBe(401);
  });

  it("limita o pool ao DB_POOL_MAX", () => {
    expect(pool.options.max).toBe(3);
  });
});
