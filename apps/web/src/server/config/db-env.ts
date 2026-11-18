import { z } from "zod";

export const DbEnvSchema = z.object({
  APP_DATABASE_URL: z.string().url(),
});
export type AppDbEnv = z.infer<typeof DbEnvSchema>;

export function parseEnv<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  source: Record<string, string | undefined>,
): T {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração inválida do app: ${fields}`);
  }
  return parsed.data;
}

// Sem 'server-only' de propósito: migrações e seed rodam fora do Next e só precisam do banco.
export function loadDbEnv(source: Record<string, string | undefined> = process.env): AppDbEnv {
  return parseEnv(DbEnvSchema, source);
}
