import { describe, expect, it } from "vitest";
import { loadDbEnv } from "../../src/server/config/db-env";
import { loadEnv } from "../../src/server/config/env";

const valid = {
  APP_DATABASE_URL: "postgres://nexo:nexo_dev@127.0.0.1:5433/nexo_app",
  SESSION_SECRET: "x".repeat(32),
  TICKET_SERVICE_URL: "http://localhost:4010",
  TICKET_SERVICE_TOKEN: "token",
  GROQ_API_KEY: "chave-groq",
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

  it("o modelo padrão é a cadeia gratuita da Groq: exige GROQ_API_KEY, exceto com modelo test/", () => {
    const semChave: Record<string, string> = { ...valid };
    delete semChave["GROQ_API_KEY"];
    expect(() => loadEnv(semChave)).toThrowError(/GROQ_API_KEY/);
    expect(() => loadEnv({ ...semChave, NEXO_AGENT_MODEL: "test/echo" })).not.toThrow();
  });

  it("modelo google/ exige a chave do Gemini", () => {
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "google/gemini-3.5-flash-lite" })).toThrowError(
      /GOOGLE_GENERATIVE_AI_API_KEY/,
    );
  });

  it("modelo groq/ exige GROQ_API_KEY e dispensa a chave do Gemini", () => {
    const semGroq: Record<string, string> = { ...valid, NEXO_AGENT_MODEL: "groq/openai/gpt-oss-120b" };
    delete semGroq["GROQ_API_KEY"];
    expect(() => loadEnv(semGroq)).toThrowError(/GROQ_API_KEY/);
    expect(() => loadEnv({ ...semGroq, GROQ_API_KEY: "chave-groq" })).not.toThrow();
  });

  it("recusa provedor de modelo desconhecido", () => {
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "pago/modelo-x" })).toThrowError(/NEXO_AGENT_MODEL/);
  });

  it("rejeita modelo test/ em produção, mesmo com a chave do provedor", () => {
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "test/scripted", NODE_ENV: "production" })).toThrowError(
      /NEXO_AGENT_MODEL/,
    );
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "test/scripted", NODE_ENV: "development" })).not.toThrow();
    expect(() => loadEnv({ ...valid, NEXO_AGENT_MODEL: "groq/openai/gpt-oss-20b", NODE_ENV: "production" })).not.toThrow();
  });

  it("rejeita modelo test/ em qualquer posição da cadeia em produção", () => {
    expect(() =>
      loadEnv({ ...valid, NEXO_AGENT_MODEL: "groq/openai/gpt-oss-20b,test/scripted", NODE_ENV: "production" }),
    ).toThrowError(/NEXO_AGENT_MODEL/);
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
