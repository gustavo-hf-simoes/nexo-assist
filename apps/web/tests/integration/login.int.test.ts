import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { authSessions } from "../../src/server/db/schema";
import { seedApp } from "../../src/server/db/seed";

type LoginRoute = typeof import("../../src/app/api/auth/login/route");
type Session = typeof import("../../src/server/auth/session");

describe("POST /api/auth/login (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;
  let login: LoginRoute;
  let session: Session;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);

    process.env.APP_DATABASE_URL = container.getConnectionUri();
    process.env.SESSION_SECRET = "i".repeat(40);
    process.env.TICKET_SERVICE_URL = "http://localhost:4010";
    process.env.TICKET_SERVICE_TOKEN = "token";
    process.env.NEXO_AGENT_MODEL = "test/echo";
    login = await import("../../src/app/api/auth/login/route");
    session = await import("../../src/server/auth/session");
  });

  afterAll(async () => {
    await (await import("../../src/server/db/app-db")).closeDb();
    await pool.end();
    await container.stop();
  });

  let ipCounter = 0;
  const post = (body: unknown, ip = `10.0.0.${(ipCounter += 1)}`): Promise<Response> =>
    login.POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify(body),
      }),
    );

  it("e-mail do seed com qualquer senha cria auth_sessions e o cookie", async () => {
    const res = await post({ email: "ana.souza@nexo.com.br", password: "qualquer", remember: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "employee", redirectTo: "/atendimento" });

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("nexo_session=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Max-Age=28800");

    const token = /nexo_session=([^;]+)/.exec(cookie)?.[1];
    const claims = await session.readSession(token);
    expect(claims?.userId).toBe("ana.souza");
    const [row] = await db.select().from(authSessions).where(eq(authSessions.id, claims?.sid ?? ""));
    expect(row?.userId).toBe("ana.souza");
    expect(row?.messagesSent).toBe(0);
  });

  it("sem 'Manter conectado' o cookie é de sessão (sem Max-Age)", async () => {
    const res = await post({ email: "ana.souza@nexo.com.br", password: "x", remember: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).not.toContain("Max-Age");
  });

  it("analista é levado ao console", async () => {
    const res = await post({ email: "Rafael.Lima@nexo.com.br", password: "x" });
    expect(await res.json()).toEqual({ role: "analyst", redirectTo: "/console" });
  });

  it("e-mail desconhecido devolve 401 com mensagem genérica e sem cookie", async () => {
    const res = await post({ email: "ninguem@nexo.com.br", password: "x" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "E-mail ou senha inválidos." });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("senha vazia devolve 400", async () => {
    const res = await post({ email: "ana.souza@nexo.com.br", password: "" });
    expect(res.status).toBe(400);
  });

  it("a sexta tentativa falha do mesmo IP em 1 min devolve 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await post({ email: "ninguem@nexo.com.br", password: "x" }, "9.9.9.9")).status);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // Mesmo com e-mail válido, o IP bloqueado continua barrado; outro IP segue livre.
    expect((await post({ email: "ana.souza@nexo.com.br", password: "x" }, "9.9.9.9")).status).toBe(429);
    expect((await post({ email: "ana.souza@nexo.com.br", password: "x" }, "9.9.9.8")).status).toBe(200);
  });
});
