import { desc, sql } from "drizzle-orm";
import { getDb } from "../db/app-db";
import type { Database } from "../db/client";
import { kbArticles } from "../db/schema";

export interface KbSearchResult {
  slug: string;
  title: string;
  body: string;
  rank: number;
}

// O banco é um parâmetro (padrão: o do app) para os testes usarem o Postgres do Testcontainers.
export async function searchArticles(
  query: string,
  limit = 3,
  db: Database = getDb(),
): Promise<KbSearchResult[]> {
  // websearch_to_tsquery exige todos os termos (E); trocamos por OU (o texto já vem com os radicais, por isso 'simple') e deixamos o ts_rank
  // favorecer os artigos que casam com mais termos.
  const tsQuery = sql`to_tsquery('simple', replace(websearch_to_tsquery('portuguese', ${query})::text, ' & ', ' | '))`;
  const rank = sql<number>`ts_rank(${kbArticles.search}, ${tsQuery})`;
  const rows = await db
    .select({ slug: kbArticles.slug, title: kbArticles.title, body: kbArticles.body, rank })
    .from(kbArticles)
    .where(sql`${kbArticles.search} @@ ${tsQuery}`)
    .orderBy(desc(rank))
    .limit(limit);
  return rows.map((row) => ({ ...row, rank: Number(row.rank) }));
}
