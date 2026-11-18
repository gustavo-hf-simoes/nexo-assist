import { NextResponse } from "next/server";
import { sessionCookieFrom } from "@/server/auth/guards";
import { readSession, revokeSession, SESSION_COOKIE } from "@/server/auth/session";

export async function POST(req: Request): Promise<Response> {
  const claims = await readSession(sessionCookieFrom(req));
  if (claims) await revokeSession(claims.sid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
