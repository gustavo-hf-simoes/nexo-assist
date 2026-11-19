import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";

const valid = {
  TICKETS_DATABASE_URL: "postgres://nexo:nexo_dev@localhost:5432/nexo_tickets",
  TICKET_SERVICE_TOKEN: "token",
};

describe("loadEnv do serviço de chamados", () => {
  it("aplica os valores padrão", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(4010);
    expect(env.DB_POOL_MAX).toBe(10);
  });

  it("DB_POOL_MAX aceita um teto menor para serverless e recusa zero", () => {
    expect(loadEnv({ ...valid, DB_POOL_MAX: "3" }).DB_POOL_MAX).toBe(3);
    expect(() => loadEnv({ ...valid, DB_POOL_MAX: "0" })).toThrowError(/DB_POOL_MAX/);
  });
});
