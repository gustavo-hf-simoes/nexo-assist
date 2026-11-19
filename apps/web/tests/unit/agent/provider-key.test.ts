import { describe, expect, it } from "vitest";
import { modelChainProblems, parseModelChain, providerKeyFor } from "../../../src/server/agent/provider-key";

describe("providerKeyFor", () => {
  it("devolve a variável da chave de cada provedor suportado", () => {
    expect(providerKeyFor("google/gemini-3.8-flash")).toEqual({ kind: "key", provider: "google", keyName: "GOOGLE_GENERATIVE_AI_API_KEY" });
    expect(providerKeyFor("groq/openai/gpt-oss-120b")).toEqual({ kind: "key", provider: "groq", keyName: "GROQ_API_KEY" });
  });

  it("modelo test/ dispensa chave", () => {
    expect(providerKeyFor("test/scripted")).toEqual({ kind: "none" });
  });

  it("provedor desconhecido é recusado", () => {
    expect(providerKeyFor("pago/modelo-x")).toEqual({ kind: "unsupported", provider: "pago" });
  });
});

describe("parseModelChain", () => {
  it("separa a lista por vírgula, sem espaços nem itens vazios", () => {
    expect(parseModelChain("groq/openai/gpt-oss-120b, groq/qwen/qwen3.8-27b ,")).toEqual([
      "groq/openai/gpt-oss-120b",
      "groq/qwen/qwen3.8-27b",
    ]);
  });
});

describe("modelChainProblems", () => {
  it("cada modelo da cadeia exige a chave do seu provedor", () => {
    const chain = "groq/openai/gpt-oss-120b,google/gemini-3.5-flash-lite";
    expect(modelChainProblems(chain, { GROQ_API_KEY: "g", GOOGLE_GENERATIVE_AI_API_KEY: "k" })).toEqual([]);
    expect(modelChainProblems(chain, { GROQ_API_KEY: "g" })).toEqual([
      { path: "GOOGLE_GENERATIVE_AI_API_KEY", message: expect.stringContaining("google/") },
    ]);
  });

  it("aponta provedor desconhecido e lista vazia", () => {
    expect(modelChainProblems("groq/x,pago/y", { GROQ_API_KEY: "g" })).toEqual([
      { path: "NEXO_AGENT_MODEL", message: expect.stringContaining('"pago"') },
    ]);
    expect(modelChainProblems(" , ", {})).toEqual([{ path: "NEXO_AGENT_MODEL", message: expect.stringContaining("vazia") }]);
  });
});
