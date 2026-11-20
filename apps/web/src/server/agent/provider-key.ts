// Provedores com plano gratuito suportados pelo model router do Mastra e a variável da chave de cada um.
// Fica fora de config/env.ts (que é server-only) para o eval, que roda com tsx, reaproveitar a regra.
const PROVIDER_KEYS = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
} as const;

export type ProviderKeyName = (typeof PROVIDER_KEYS)[keyof typeof PROVIDER_KEYS];
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_KEYS);

export type ProviderKey =
  | { kind: "key"; provider: string; keyName: ProviderKeyName }
  | { kind: "none" }
  | { kind: "unsupported"; provider: string };

export function providerKeyFor(modelId: string): ProviderKey {
  const provider = modelId.split("/")[0] ?? "";
  if (provider === "test") return { kind: "none" };
  if (Object.hasOwn(PROVIDER_KEYS, provider)) {
    return { kind: "key", provider, keyName: PROVIDER_KEYS[provider as keyof typeof PROVIDER_KEYS] };
  }
  return { kind: "unsupported", provider };
}

// NEXO_AGENT_MODEL aceita uma lista separada por vírgula: o primeiro modelo atende e os demais entram
// quando ele falha (por exemplo, 429 por cota diária esgotada). Somar cotas gratuitas mantém o custo zero.
export function parseModelChain(value: string): string[] {
  return value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export interface ModelChainProblem {
  path: string;
  message: string;
}

export function modelChainProblems(value: string, env: Readonly<Record<string, unknown>>): ModelChainProblem[] {
  const ids = parseModelChain(value);
  if (ids.length === 0) return [{ path: "NEXO_AGENT_MODEL", message: "lista de modelos vazia" }];
  const problems: ModelChainProblem[] = [];
  const reported = new Set<string>();
  for (const id of ids) {
    const required = providerKeyFor(id);
    if (required.kind === "unsupported") {
      problems.push({
        path: "NEXO_AGENT_MODEL",
        message: `provedor "${required.provider}" não suportado; use ${SUPPORTED_PROVIDERS.join(", ")} ou test/`,
      });
    } else if (required.kind === "key" && !env[required.keyName] && !reported.has(required.keyName)) {
      reported.add(required.keyName);
      problems.push({
        path: required.keyName,
        message: `obrigatória para modelos ${required.provider}/, exceto quando NEXO_AGENT_MODEL começa com test/`,
      });
    }
  }
  return problems;
}
