import { NextResponse } from "next/server";
import { z } from "zod";
import { loginRateLimiter } from "@/server/auth/login-rate-limit";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/server/auth/session";
import { findUserByEmail } from "@/server/auth/user-repository";
import { getDb } from "@/server/db/app-db";

const BodySchema = z.object({
  email: z.string().trim().min(1),
  // Demo: a senha só precisa estar preenchida; a identidade vem do e-mail do seed.
  password: z.string().min(1),
  remember: z.boolean().default(false),
});

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (loginRateLimiter.isBlocked(ip)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente de novo." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const body: unknown = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe e-mail e senha." }, { status: 400 });
  }

  const user = await findUserByEmail(getDb(), parsed.data.email);
  if (!user) {
    loginRateLimiter.recordFailure(ip);
    return NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const token = await createSession(user);
  const res = NextResponse.json({
    role: user.role,
    redirectTo: user.role === "analyst" ? "/console" : "/atendimento",
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Sem "Manter conectado" o cookie morre ao fechar o navegador (o JWT ainda expira em 8 h).
    ...(parsed.data.remember ? { maxAge: SESSION_TTL_SECONDS } : {}),
  });
  return res;
}
