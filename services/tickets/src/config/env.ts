import { z } from "zod";

const EnvSchema = z.object({
  TICKETS_DATABASE_URL: z.string().url(),
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
