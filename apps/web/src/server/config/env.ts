import "server-only";
import { z } from "zod";
import { DbEnvSchema, parseEnv } from "./db-env";

const EnvSchema = DbEnvSchema.extend({
  SESSION_SECRET: z.string().min(32),
  TICKET_SERVICE_URL: z.string().url(),
  TICKET_SERVICE_TOKEN: z.string().min(1),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  NEXO_AGENT_MODEL: z.string().min(1).optional(),
  AGENT_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  SESSION_MESSAGE_LIMIT: z.coerce.number().int().min(1).default(30),
  DAILY_LLM_TURN_LIMIT: z.coerce.number().int().min(1).default(500),
  NODE_ENV: z.string().optional(),
}).superRefine((value, ctx) => {
  // Modelos "test/..." rodam sem chamar o Gemini, então dispensam a chave.
  const usesTestModel = value.NEXO_AGENT_MODEL?.startsWith("test/") === true;
  if (usesTestModel && value.NODE_ENV === "production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NEXO_AGENT_MODEL"],
      message: "modelos test/ não são permitidos em produção (NODE_ENV=production)",
    });
  }
  if (!usesTestModel && !value.GOOGLE_GENERATIVE_AI_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GOOGLE_GENERATIVE_AI_API_KEY"],
      message: "obrigatória, exceto quando NEXO_AGENT_MODEL começa com test/",
    });
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
