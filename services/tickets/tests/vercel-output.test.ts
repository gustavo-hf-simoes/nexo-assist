import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildVercelOutput } from "../scripts/build-vercel-output";

const ENV = {
  TICKETS_DATABASE_URL: "postgres://nexo:nexo_dev@localhost:5432/nexo_tickets",
  TICKET_SERVICE_TOKEN: "token",
  DB_POOL_MAX: "3",
};

describe("saída da Vercel (Build Output API)", () => {
  const outDir = mkdtempSync(join(tmpdir(), "nexo-vercel-"));

  beforeAll(async () => {
    await buildVercelOutput(outDir);
  }, 60_000);

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it("encaminha todas as rotas para uma única função Node 22", () => {
    const config = JSON.parse(readFileSync(join(outDir, "config.json"), "utf8")) as unknown;
    expect(config).toEqual({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] });
    const vc = JSON.parse(readFileSync(join(outDir, "functions/index.func/.vc-config.json"), "utf8")) as unknown;
    expect(vc).toMatchObject({ runtime: "nodejs22.x", handler: "index.cjs", launcherType: "Nodejs" });
  });

  it("o bundle responde /health e exige o token nas rotas de chamados", async () => {
    Object.assign(process.env, ENV);
    const require = createRequire(import.meta.url);
    const mod = require(join(outDir, "functions/index.func/index.cjs")) as { default: RequestListener };
    const server = createServer(mod.default);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    try {
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${port}/tickets?requesterId=ana.souza`)).status).toBe(401);
    } finally {
      server.close();
    }
  });
});
