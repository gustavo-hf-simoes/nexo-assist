import { defineConfig } from "drizzle-kit";

// drizzle-kit exige export default neste arquivo de configuração de ferramenta.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env["TICKETS_DATABASE_URL"] ?? "" },
});
