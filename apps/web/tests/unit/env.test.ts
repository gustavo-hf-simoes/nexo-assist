import { describe, expect, it } from "vitest";
import { loadDbEnv } from "../../src/server/config/db-env";
import { loadEnv } from "../../src/server/config/env";

const valid = {
  APP_DATABASE_URL: "postgres://nexo:nexo_dev@127.0.0.1:5433/nexo_app",
  SESSION_SECRET: "x".repeat(32),
  TICKET_SERVICE_URL: "http://localhost:4010",
  TICKET_SERVICE_TOKEN: "token",
  GOOGLE_GENERATIVE_AI_API_KEY: "chave-de-teste",
};

describe("loadEnv", () => {
  it("lança um erro que cita SESSION_SECRET e APP_DATABASE_URL quando falta tudo", () => {
    expect(() => loadEnv({})).toThrowError(/SESSION_SECRET/);
    expect(() => loadEnv({})).toThrowError(/APP_DATABASE_URL/);
  });

  it("rejeita SESSION_SECRET com 10 caracteres", () => {
    expect(() => loadEnv({ ...valid, SESSION_SECRET: "x".repeat(10) })).toThrowError(
      /SESSION_SECRET/,
    );
  });

  it("rejeita AGENT_MIN_CONFIDENCE fora de 0 a 1", () => {
    expect(() => loadEnv({ ...valid, AGENT_MIN_CONFIDENCE: "1.5" })).toThrowError(
      /AGENT_MIN_CONFIDENCE/,
    );
  });

  it("exige a chave do Gemini, exceto com modelo test/", () => {
    const semChave: Record<string, string> = { ...valid };
    delete semChave["GOOGLE_GENERATIVE_AI_API_KEY"];
    expect(() => loadEnv(semChave)).toThrowError(/GOOGLE_GENERATIVE_AI_API_KEY/);
    expect(() => loadEnv({ ...semChave, NEXO_AGENT_MODEL: "test/echo" })).not.toThrow();
  });

  it("rejeita modelo test/ em produção, mesmo com a chave do Gemini", () => {
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "test/scripted", NODE_ENV: "production" })).toThrowError(
      /NEXO_AGENT_MODEL/,
    );
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "test/scripted", NODE_ENV: "development" })).not.toThrow();
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "google/gemini-3.8-flash", NODE_ENV: "production" })).not.toThrow();
  });

  it("reconhece produção mesmo com NODE_ENV em outra caixa ou com espaços", () => {
    for (const NODE_ENV of ["Production", " PRODUCTION ", "production	"]) {
      expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "test/scripted", NODE_ENV })).toThrowError(/NEXO_AGENT_MODEL/);
    }
  });

  it("aplica os valores padrão", () => {
    const env = loadEnv(valid);
    expect(env.AGENT_MIN_CONFIDENCE).toBe(0.6);
    expect(env.SESSION_MESSAGE_LIMIT).toBe(30);
    expect(env.DAILY_LLM_TURN_LIMIT).toBe(500);
    expect(env.DB_POOL_MAX).toBe(10);
  });

  it("DB_POOL_MAX aceita um teto menor para serverless e recusa zero", () => {
    expect(loadEnv({ ...valid, DB_POOL_MAX: "3" }).DB_POOL_MAX).toBe(3);
    expect(() => loadEnv({ ...valid, DB_POOL_MAX: "0" })).toThrowError(/DB_POOL_MAX/);
  });
});

describe("loadDbEnv", () => {
  it("exige só o banco", () => {
    expect(loadDbEnv({ APP_DATABASE_URL: valid.APP_DATABASE_URL }).APP_DATABASE_URL).toBe(
      valid.APP_DATABASE_URL,
    );
    expect(() => loadDbEnv({})).toThrowError(/APP_DATABASE_URL/);
  });
});
