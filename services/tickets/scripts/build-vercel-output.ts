import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Gera .vercel/output (Build Output API v3) com o serviço inteiro num bundle CJS único:
// resolve o @nexo/domain em TypeScript e os imports ESM sem extensão, que o runtime Node não aceita.
export async function buildVercelOutput(outDir: string = join(ROOT, ".vercel/output")): Promise<void> {
  const funcDir = join(outDir, "functions/index.func");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(funcDir, { recursive: true });

  await build({
    entryPoints: [join(ROOT, "src/vercel-entry.ts")],
    outfile: join(funcDir, "index.cjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    // Dependência opcional do pg, nunca usada aqui.
    external: ["pg-native"],
    logLevel: "warning",
  });

  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(join(outDir, "config.json"), json({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }));
  await writeFile(
    join(funcDir, ".vc-config.json"),
    json({ runtime: "nodejs22.x", handler: "index.cjs", launcherType: "Nodejs", shouldAddHelpers: false }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildVercelOutput();
  console.log("Saída da Vercel gerada em .vercel/output.");
}
