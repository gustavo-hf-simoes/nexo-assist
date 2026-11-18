import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "../../src/server/db/client";
import { runMigrations } from "../../src/server/db/migrate";
import { seedApp } from "../../src/server/db/seed";
import { searchArticles } from "../../src/server/knowledge/knowledge-base";

describe("searchArticles (Postgres real)", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    ({ db, pool } = createDb(container.getConnectionUri()));
    await runMigrations(db);
    await seedApp(db);
  });

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  it("'vpn erro 809' traz o artigo do erro 809 em primeiro", async () => {
    const results = await searchArticles("vpn erro 809", 3, db);
    expect(results[0]?.slug).toBe("vpn-erro-809");
    expect(results[0]?.rank).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("'horário atendimento' acha o artigo de horário do service desk", async () => {
    const results = await searchArticles("horário atendimento", 3, db);
    expect(results.some((r) => r.title.includes("Horário do service desk"))).toBe(true);
  });

  it("consulta sem correspondência devolve lista vazia", async () => {
    expect(await searchArticles("xyzzyqwerty", 3, db)).toEqual([]);
  });
});
