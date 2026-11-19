import "server-only";
import type { Pool } from "pg";
import { env } from "../config/env";
import { createDb, type Database } from "./client";

const globalForDb = globalThis as unknown as { nexoAppDb?: { db: Database; pool: Pool } };

// Um pool por processo (sobrevive ao hot reload do dev).
export function getDb(): Database {
  globalForDb.nexoAppDb ??= createDb(env.APP_DATABASE_URL, { max: env.DB_POOL_MAX });
  return globalForDb.nexoAppDb.db;
}

export async function closeDb(): Promise<void> {
  const current = globalForDb.nexoAppDb;
  delete globalForDb.nexoAppDb;
  await current?.pool.end();
}
