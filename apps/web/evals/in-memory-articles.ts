import { SEED_ARTICLES } from "../src/server/db/seed";
import type { KbSearchResult } from "../src/server/knowledge/knowledge-base";

const MAX_RESULTS = 3;
const STEM_LENGTH = 5;
const STOP_WORDS = new Set(["qual", "como", "meu", "minha", "para", "por", "com", "uma", "que", "dos", "das", "nao"]);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

interface IndexedArticle {
  slug: string;
  title: string;
  body: string;
  haystack: string;
}

const INDEX: IndexedArticle[] = SEED_ARTICLES.map((a) => ({
  slug: a.slug,
  title: a.title,
  body: a.body,
  haystack: normalize([a.title, a.body, ...(a.tags ?? [])].join(" ")),
}));

// Busca simples sobre os artigos do seed (sem banco), para o eval não depender de Postgres.
// Casa cada palavra da consulta, ou o radical dela, no texto do artigo; a nota é a fração casada.
export async function searchSeedArticles(query: string): Promise<KbSearchResult[]> {
  const words = tokens(query);
  if (words.length === 0) return [];
  return INDEX.map((article) => {
    const hits = words.filter(
      (w) => article.haystack.includes(w) || (w.length > STEM_LENGTH && article.haystack.includes(w.slice(0, STEM_LENGTH))),
    ).length;
    return { slug: article.slug, title: article.title, body: article.body, rank: hits / words.length };
  })
    .filter((r) => r.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_RESULTS);
}
