import { z } from "zod";

const DbEnvSchema = z.object({
  TICKETS_DATABASE_URL: z.string().url(),
});
export type TicketsDbEnv = z.infer<typeof DbEnvSchema>;

const EnvSchema = DbEnvSchema.extend({
  TICKET_SERVICE_TOKEN: z.string().min(1),
  TICKET_SERVICE_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  TICKET_SERVICE_LATENCY_MS: z.coerce.number().int().min(0).default(0),
  PORT: z.coerce.number().int().min(1).max(65535).default(4010),
});
export type TicketsEnv = z.infer<typeof EnvSchema>;

function parseEnv<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  source: Record<string, string | undefined>,
): T {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração inválida do serviço de chamados: ${fields}`);
  }
  return parsed.data;
}

// Falha cedo (com a lista de variáveis ausentes) quando a configuração está incompleta.
// Migrações e seed só precisam do banco; o servidor precisa de tudo.
export function loadDbEnv(source: Record<string, string | undefined> = process.env): TicketsDbEnv {
  return parseEnv(DbEnvSchema, source);
}

export function loadEnv(source: Record<string, string | undefined> = process.env): TicketsEnv {
  return parseEnv(EnvSchema, source);
}
