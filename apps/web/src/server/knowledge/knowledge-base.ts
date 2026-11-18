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
  if (query.trim() === "") return [];
  const strict = sql`websearch_to_tsquery('portuguese', ${query})`;
  // Amplia E para OU só quando a consulta é feita de termos soltos. Com negação (!) ou frase
  // (<->) a consulta fica como o websearch_to_tsquery a interpretou, para não inverter o
  // sentido de "-termo". O texto já vem com radicais, por isso o parse usa 'simple'.
  const tsQuery = sql`(case
    when numnode(${strict}) = 0 or ${strict}::text ~ '[!<]' then ${strict}
    else to_tsquery('simple', replace(${strict}::text, ' & ', ' | '))
  end)`;
  const rank = sql<number>`ts_rank(${kbArticles.search}, ${tsQuery})`;
  const rows = await db
    .select({ slug: kbArticles.slug, title: kbArticles.title, body: kbArticles.body, rank })
    .from(kbArticles)
    .where(sql`${kbArticles.search} @@ ${tsQuery}`)
    .orderBy(desc(rank))
    .limit(limit);
  return rows.map((row) => ({ ...row, rank: Number(row.rank) }));
}
