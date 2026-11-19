const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// O setup do E2E apaga dados: só roda contra um banco local, nunca contra um apontado por engano.
export function assertLocalDatabaseUrl(name: string, url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`${name} não é uma URL de banco válida; o setup do E2E não roda.`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`${name} aponta para "${host}"; o setup do E2E só apaga dados de banco local.`);
  }
}
