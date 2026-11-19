import { describe, expect, it } from "vitest";
import { assertLocalDatabaseUrl } from "../e2e/local-db-guard";

describe("assertLocalDatabaseUrl", () => {
  it("aceita bancos em localhost, 127.0.0.1 e [::1]", () => {
    for (const url of [
      "postgres://u:p@localhost:5433/nexo",
      "postgresql://u:p@127.0.0.1/nexo",
      "postgres://u:p@[::1]:5432/nexo",
    ]) {
      expect(() => assertLocalDatabaseUrl("APP_DATABASE_URL", url)).not.toThrow();
    }
  });

  it("recusa host remoto, URL vazia ou inválida, citando a variável", () => {
    for (const url of ["postgres://u:p@db.prod.nexo.com.br/nexo", "postgres://u:p@localhost.evil.com/x", "", "não é url"]) {
      expect(() => assertLocalDatabaseUrl("TICKETS_DATABASE_URL", url)).toThrowError(/TICKETS_DATABASE_URL/);
    }
  });
});
