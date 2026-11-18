import { defineConfig } from "drizzle-kit";

// drizzle-kit exige export default neste arquivo de configuração de ferramenta.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env["APP_DATABASE_URL"] ?? "" },
});
