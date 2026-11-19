import "server-only";
import { z } from "zod";
import { DEFAULT_AGENT_MODEL } from "../agent/model";
import { modelChainProblems, parseModelChain } from "../agent/provider-key";
import { DbEnvSchema, parseEnv } from "./db-env";

const EnvSchema = DbEnvSchema.extend({
  SESSION_SECRET: z.string().min(32),
  TICKET_SERVICE_URL: z.string().url(),
  TICKET_SERVICE_TOKEN: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  NEXO_AGENT_MODEL: z.string().min(1).optional(),
  AGENT_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  SESSION_MESSAGE_LIMIT: z.coerce.number().int().min(1).default(30),
  DAILY_LLM_TURN_LIMIT: z.coerce.number().int().min(1).default(500),
  // Conexões por instância; em serverless (várias instâncias) vale um teto baixo, como 3.
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  NODE_ENV: z.string().optional(),
}).superRefine((value, ctx) => {
  // Modelos "test/..." rodam sem chamar provedor, então dispensam chave, mas nunca em produção.
  const chain = value.NEXO_AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
  const usesTestModel = parseModelChain(chain).some((id) => id.startsWith("test/"));
  if (usesTestModel && value.NODE_ENV?.trim().toLowerCase() === "production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NEXO_AGENT_MODEL"],
      message: "modelos test/ não são permitidos em produção (NODE_ENV=production)",
    });
  }
  // Cada provedor gratuito suportado exige a própria chave; provedor fora da lista falha cedo.
  for (const problem of modelChainProblems(chain, value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [problem.path], message: problem.message });
  }
});
export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  return parseEnv(EnvSchema, source);
}

let cached: AppEnv | undefined;

// Lido sob demanda (na primeira propriedade acessada), para o build do Next não exigir variáveis.
export const env: AppEnv = new Proxy({} as AppEnv, {
  get(_target, prop) {
    cached ??= loadEnv();
    return cached[prop as keyof AppEnv];
  },
});
