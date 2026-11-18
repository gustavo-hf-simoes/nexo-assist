// Violação de UNIQUE (SQLSTATE 23505), com ou sem o wrapper de erro do drizzle (`cause`).
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown): unknown => (typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined);
  const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}
