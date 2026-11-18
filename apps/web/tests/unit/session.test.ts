import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, UnauthorizedError, toHttpError } from "../../src/server/errors";
import { requireAnalyst, requireEmployee } from "../../src/server/auth/guards";
import { createLoginRateLimiter } from "../../src/server/auth/login-rate-limit";
import { SESSION_COOKIE, readSession, signSession } from "../../src/server/auth/session";

const SECRET = "s".repeat(40);

const claims = {
  sid: "5b0f6f4e-7a65-4d9c-9a56-1d3f6d8f9a01",
  userId: "ana.souza",
  role: "employee",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
} as const;

function requestWith(cookie?: string): Request {
  return new Request("http://localhost/api/console/queue", {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("APP_DATABASE_URL", "postgres://nexo:nexo_dev@127.0.0.1:5433/nexo_app");
  vi.stubEnv("TICKET_SERVICE_URL", "http://localhost:4010");
  vi.stubEnv("TICKET_SERVICE_TOKEN", "token");
  vi.stubEnv("NEXO_AGENT_MODEL", "test/echo");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessão (JWT)", () => {
  it("devolve as claims de um token válido", async () => {
    const token = await signSession(claims);
    expect(await readSession(token)).toEqual(claims);
  });

  it("devolve null para um token adulterado", async () => {
    const token = await signSession(claims);
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...claims, role: "analyst", exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    expect(await readSession(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await readSession(`${header}.${payload}.x${signature}`)).toBeNull();
  });

  it("devolve null para token assinado com outro segredo, expirado, vazio ou ausente", async () => {
    const otherKey = new TextEncoder().encode("o".repeat(40));
    const foreign = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(otherKey);
    const expired = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRET));
    expect(await readSession(foreign)).toBeNull();
    expect(await readSession(expired)).toBeNull();
    expect(await readSession("")).toBeNull();
    expect(await readSession(undefined)).toBeNull();
  });
});

describe("guards", () => {
  it("sem cookie lança UnauthorizedError (401) sem consultar o banco", async () => {
    const error = await requireEmployee(requestWith()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(toHttpError(error).status).toBe(401);
    expect(toHttpError(new ForbiddenError()).status).toBe(403);
  });

  it("cookie com JWT adulterado lança UnauthorizedError", async () => {
    const token = await signSession(claims);
    const error = await requireAnalyst(requestWith(token.slice(0, -2) + "xx")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedError);
  });
});

describe("limite de tentativas de login", () => {
  it("bloqueia o IP após 5 falhas na janela e libera depois dela", () => {
    let now = 1_000_000;
    const limiter = createLoginRateLimiter({ maxFailures: 5, windowMs: 60_000, now: () => now });
    for (let i = 0; i < 5; i += 1) {
      expect(limiter.isBlocked("1.1.1.1")).toBe(false);
      limiter.recordFailure("1.1.1.1");
    }
    expect(limiter.isBlocked("1.1.1.1")).toBe(true);
    expect(limiter.isBlocked("2.2.2.2")).toBe(false);
    now += 60_001;
    expect(limiter.isBlocked("1.1.1.1")).toBe(false);
  });
});
