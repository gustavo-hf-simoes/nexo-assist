import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { DEFAULT_AGENT_MODEL } from "../src/server/agent/model";
import { modelChainProblems, parseModelChain, providerKeyFor } from "../src/server/agent/provider-key";
import { runScenario } from "./harness";
import { renderReport, type ReportRow } from "./report";
import { retryOnRateLimit } from "./retry";
import { SCENARIOS } from "./scenarios";
import { meetsThreshold, parseMinPassRate, passRate, scoreScenario } from "./score";

const REPORT_PATH = new URL("./report.md", import.meta.url);
const EXIT_BELOW_THRESHOLD = 1;
const EXIT_BAD_CONFIG = 2;
// Janela do limite por minuto do provedor: três tentativas cobrem um pico de tokens entre cenários.
const RATE_LIMIT_RETRY = { attempts: 3, waitMs: 60_000 };

function onlyFilter(argv: readonly string[]): string | undefined {
  const index = argv.indexOf("--only");
  return index === -1 ? undefined : argv[index + 1];
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

export async function main(argv: readonly string[] = process.argv.slice(2), env = process.env): Promise<number> {
  const modelId = env["NEXO_AGENT_MODEL"] || DEFAULT_AGENT_MODEL;
  const problems = modelChainProblems(modelId, env);

  // Falha cedo, antes de qualquer chamada: o eval usa o modelo de verdade e consome a cota do provedor.
  if (problems.length > 0) {
    for (const problem of problems) console.error(`${problem.path}: ${problem.message}.`);
    console.error("Copie .env.example para .env, preencha as chaves e rode `npm run eval` de novo.");
    return EXIT_BAD_CONFIG;
  }
  const usesRealModel = parseModelChain(modelId).some((id) => providerKeyFor(id).kind === "key");
  let minPassRate: number;
  try {
    minPassRate = parseMinPassRate(env["EVAL_MIN_PASS_RATE"]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "EVAL_MIN_PASS_RATE inválida.");
    return EXIT_BAD_CONFIG;
  }

  const only = onlyFilter(argv);
  const scenarios = only ? SCENARIOS.filter((s) => s.name.toLowerCase().includes(only.toLowerCase())) : SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`Nenhum cenário casa com "${only ?? ""}".`);
    return EXIT_BAD_CONFIG;
  }

  console.log(`Eval das decisões: ${scenarios.length} cenários, modelo ${modelId}`);
  const rows: ReportRow[] = [];
  for (const scenario of scenarios) {
    try {
      const run = await retryOnRateLimit(() => runScenario(scenario, { modelId }), RATE_LIMIT_RETRY);
      const result = scoreScenario(scenario, run.observed);
      rows.push({ name: scenario.name, ...result, tokens: run.tokens, ms: run.ms });
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      rows.push({ name: scenario.name, passed: false, reasons: [`erro ao rodar o cenário: ${message}`], tokens: 0, ms: 0 });
    }
    const row = rows[rows.length - 1];
    if (row) console.log(`${row.passed ? "OK    " : "FALHOU"} ${pad(row.name, 64)} ${String(row.tokens).padStart(7)} tokens`);
  }

  const rate = passRate(rows);
  const average = Math.round(rows.reduce((sum, r) => sum + r.tokens, 0) / rows.length);
  for (const row of rows.filter((r) => !r.passed)) {
    console.log(`\n${row.name}`);
    for (const reason of row.reasons) console.log(`  - ${reason}`);
  }
  console.log(`\nAprovação: ${(rate * 100).toFixed(0)}% (mínimo ${(minPassRate * 100).toFixed(0)}%). Média: ${average} tokens por cenário.`);

  // O relatório só é gravado numa execução completa com o modelo real; o modelo de teste não o sobrescreve.
  if (usesRealModel && only === undefined) {
    writeFileSync(REPORT_PATH, renderReport({ modelId, generatedAt: new Date(), minPassRate, rows }), "utf-8");
    console.log("Relatório gravado em apps/web/evals/report.md");
  }
  return meetsThreshold(rate, minPassRate) ? 0 : EXIT_BELOW_THRESHOLD;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error("Falha inesperada no eval:", error instanceof Error ? error.message : "erro desconhecido");
      process.exitCode = EXIT_BAD_CONFIG;
    });
}
