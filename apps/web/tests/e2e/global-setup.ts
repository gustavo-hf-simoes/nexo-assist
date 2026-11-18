import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { e2eEnv } from "../../playwright.config";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

// Migra e popula os dois bancos (idempotente) antes de subir os servidores.
export default function globalSetup(): void {
  for (const workspace of ["@nexo/tickets", "@nexo/web"]) {
    for (const script of ["db:migrate", "db:seed"]) {
      execSync(`npm run ${script} -w ${workspace}`, { cwd: root, env: { ...process.env, ...e2eEnv }, stdio: "inherit" });
    }
  }
}
