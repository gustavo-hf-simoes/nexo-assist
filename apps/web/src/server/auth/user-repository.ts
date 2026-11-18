import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import type { SessionUser } from "./session";

export async function findUserByEmail(db: Database, email: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return row ?? null;
}
