import "server-only";
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

async function requireSession(req: Request): Promise<SessionClaims> {
  const claims = await readSession(cookieFrom(req, SESSION_COOKIE));
  if (!claims) throw new UnauthorizedError();
  return claims;
}

export async function requireEmployee(req: Request): Promise<SessionClaims> {
  const claims = await requireSession(req);
  if (claims.role !== "employee") throw new ForbiddenError();
  return claims;
}

export async function requireAnalyst(req: Request): Promise<SessionClaims> {
  const claims = await requireSession(req);
  if (claims.role !== "analyst") throw new ForbiddenError();
  return claims;
}
