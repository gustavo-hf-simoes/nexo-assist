import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "../db/app-db";
import type { Database } from "../db/client";
import { authSessions } from "../db/schema";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { readSession, SESSION_COOKIE, type SessionClaims } from "./session";

function cookieFrom(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

export function sessionCookieFrom(req: Request): string | undefined {
  return cookieFrom(req, SESSION_COOKIE);
}

// O banco é a autoridade: sem linha em auth_sessions, ou já expirada (logout), a sessão não vale.
async function requireSession(req: Request, db: Database): Promise<SessionClaims> {
  const claims = await readSession(sessionCookieFrom(req));
  if (!claims) throw new UnauthorizedError();
  const [row] = await db
    .select({ expiresAt: authSessions.expiresAt })
    .from(authSessions)
    .where(eq(authSessions.id, claims.sid))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) throw new UnauthorizedError();
  return claims;
}

export async function requireEmployee(req: Request, db: Database = getDb()): Promise<SessionClaims> {
  const claims = await requireSession(req, db);
  if (claims.role !== "employee") throw new ForbiddenError();
  return claims;
}

export async function requireAnalyst(req: Request, db: Database = getDb()): Promise<SessionClaims> {
  const claims = await requireSession(req, db);
  if (claims.role !== "analyst") throw new ForbiddenError();
  return claims;
}
