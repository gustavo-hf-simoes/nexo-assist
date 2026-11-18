import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { authSessions } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";

type Guards = typeof import("../../src/server/auth/guards");
type Session = typeof import("../../src/server/auth/session");
type LogoutRoute = typeof import("../../src/app/api/auth/logout/route");
type Errors = typeof import("../../src/server/errors");

describe("guards com revogação no servidor (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let guards: Guards;
  let session: Session;
  let logout: LogoutRoute;
  let errors: Errors;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);

    process.env.APP_DATABASE_URL = container.getConnectionUri();
    process.env.SESSION_SECRET = "g".repeat(40);
    process.env.TICKET_SERVICE_URL = "http://localhost:4010";
    process.env.TICKET_SERVICE_TOKEN = "token";
    process.env.NEXO_AGENT_MODEL = "test/echo";
    guards = await import("../../src/server/auth/guards");
    session = await import("../../src/server/auth/session");
    logout = await import("../../src/app/api/auth/logout/route");
    errors = await import("../../src/server/errors");
  });

  afterAll(async () => {
    await (await import("../../src/server/db/app-db")).closeDb();
    await pool.end();
    await container.stop();
  });

  const ana = { id: "ana.souza", name: "Ana Souza", email: "ana.souza@nexo.com.br", role: "employee" } as const;
  const rafael = { id: "rafael.lima", name: "Rafael Lima", email: "rafael.lima@nexo.com.br", role: "analyst" } as const;

  const asRequest = (token: string, path = "/api/console/queue", method = "GET"): Request =>
    new Request(`http://localhost${path}`, { method, headers: { cookie: `nexo_session=${token}` } });

  it("sessão válida passa; funcionário em rota do console leva 403", async () => {
    const token = await session.createSession(ana, db);
    expect((await guards.requireEmployee(asRequest(token), db)).userId).toBe("ana.souza");
    const error = await guards.requireAnalyst(asRequest(token), db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(errors.ForbiddenError);
    expect(errors.toHttpError(error).status).toBe(403);
    const analystToken = await session.createSession(rafael, db);
    expect((await guards.requireAnalyst(asRequest(analystToken), db)).role).toBe("analyst");
  });

  it("depois do logout o cookie antigo recebe 401", async () => {
    const token = await session.createSession(ana, db);
    const claims = await session.readSession(token);
    await expect(guards.requireEmployee(asRequest(token), db)).resolves.toBeDefined();

    const res = await logout.POST(asRequest(token, "/api/auth/logout", "POST"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");

    const error = await guards.requireEmployee(asRequest(token), db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(errors.UnauthorizedError);
    expect(errors.toHttpError(error).status).toBe(401);
    // A linha permanece (histórico), só expira.
    const [row] = await db.select().from(authSessions).where(eq(authSessions.id, claims?.sid ?? ""));
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("linha de auth_sessions expirada ou ausente devolve 401", async () => {
    const token = await session.createSession(ana, db);
    const claims = await session.readSession(token);
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.id, claims?.sid ?? ""));
    await expect(guards.requireEmployee(asRequest(token), db)).rejects.toBeInstanceOf(errors.UnauthorizedError);

    const other = await session.createSession(ana, db);
    const otherClaims = await session.readSession(other);
    await db.delete(authSessions).where(eq(authSessions.id, otherClaims?.sid ?? ""));
    await expect(guards.requireEmployee(asRequest(other), db)).rejects.toBeInstanceOf(errors.UnauthorizedError);
  });
});
