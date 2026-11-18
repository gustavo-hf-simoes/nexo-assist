const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "do", "da", "dos", "das", "em", "no", "na",
  "nos", "nas", "por", "para", "pra", "com", "sem", "sob", "sobre", "ate", "apos", "que", "se", "e",
  "ou", "mas", "ao", "aos", "meu", "minha", "meus", "minhas", "seu", "sua", "esta", "este", "esse",
  "essa", "isso", "isto", "muito", "muita", "mais", "menos", "ja", "nao", "sim", "ficou", "estao",
  "foi", "ser", "ter", "tem", "ha", "como", "quando", "toda", "todo", "tudo", "cada",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Palavras relevantes: minúsculas, sem acento, sem stopwords pt-BR e com 3+ letras.
export function significantWords(text: string): string[] {
  const words = stripAccents(text.toLowerCase()).match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= 3 && !STOPWORDS.has(w)))];
}
