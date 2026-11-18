import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { env } from "../config/env";
import { authSessions } from "../db/schema";
import type { Database } from "../db/client";
import { getDb } from "../db/app-db";

export const SESSION_COOKIE = "nexo_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ClaimsSchema = z.object({
  sid: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(["employee", "analyst"]),
  name: z.string(),
  email: z.string(),
});
export type SessionClaims = z.infer<typeof ClaimsSchema>;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "analyst";
};

const secretKey = () => new TextEncoder().encode(env.SESSION_SECRET);

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

// Registra a sessão em auth_sessions (a contagem de mensagens vive lá) e devolve o JWT.
export async function createSession(
  user: SessionUser,
  db: Database = getDb(),
): Promise<string> {
  const [row] = await db
    .insert(authSessions)
    .values({ userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) })
    .returning({ id: authSessions.id });
  if (!row) throw new Error("Falha ao criar a sessão.");
  return signSession({
    sid: row.id,
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
}

export async function readSession(cookieValue: string | undefined): Promise<SessionClaims | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, secretKey(), { algorithms: ["HS256"] });
    const parsed = ClaimsSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    // Assinatura inválida, token expirado ou malformado: tratado como sem sessão.
    return null;
  }
}
