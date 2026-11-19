import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DbOptions {
  max?: number;
}

export function createDb(connectionString: string, options: DbOptions = {}): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString, ...options });
  return { db: drizzle(pool, { schema }), pool };
}
