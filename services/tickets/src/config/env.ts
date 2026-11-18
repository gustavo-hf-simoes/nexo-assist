import { z } from "zod";

const EnvSchema = z.object({
  TICKETS_DATABASE_URL: z.string().url(),
  TICKET_SERVICE_TOKEN: z.string().min(1),
  TICKET_SERVICE_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  TICKET_SERVICE_LATENCY_MS: z.coerce.number().int().min(0).default(0),
  PORT: z.coerce.number().int().min(1).max(65535).default(4010),
});
export type TicketsEnv = z.infer<typeof EnvSchema>;

// Falha cedo (com a lista de variáveis ausentes) quando a configuração está incompleta.
export function loadEnv(source: Record<string, string | undefined> = process.env): TicketsEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração inválida do serviço de chamados: ${fields}`);
  }
  return parsed.data;
}
