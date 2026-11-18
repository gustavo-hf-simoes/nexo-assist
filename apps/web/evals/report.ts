export interface ReportRow {
  name: string;
  passed: boolean;
  reasons: string[];
  tokens: number;
  ms: number;
}

export interface ReportInput {
  modelId: string;
  generatedAt: Date;
  minPassRate: number;
  rows: ReportRow[];
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

export function renderReport({ modelId, generatedAt, minPassRate, rows }: ReportInput): string {
  const approved = rows.filter((r) => r.passed).length;
  const rate = rows.length === 0 ? 0 : approved / rows.length;
  const totalTokens = rows.reduce((sum, r) => sum + r.tokens, 0);
  const average = rows.length === 0 ? 0 : Math.round(totalTokens / rows.length);
  const failures = rows.filter((r) => !r.passed);
  const lines = [
    "# Relatório do eval das decisões",
    "",
    `- Modelo: \`${modelId}\``,
    `- Gerado em: ${generatedAt.toISOString()}`,
    `- Aprovação: ${approved}/${rows.length} (${percent(rate)}), mínimo exigido ${percent(minPassRate)}`,
    `- Tokens por cenário (média): ${average}`,
    "",
    "| Cenário | Resultado | Tokens | Tempo (ms) |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${r.passed ? "aprovado" : "reprovado"} | ${r.tokens} | ${r.ms} |`),
    "",
  ];
  if (failures.length > 0) {
    lines.push("## Falhas", "");
    for (const row of failures) {
      lines.push(`- ${row.name}`);
      for (const reason of row.reasons) lines.push(`  - ${reason}`);
    }
    lines.push("");
  }
  lines.push(
    rate >= minPassRate
      ? "Resultado: taxa de aprovação dentro do mínimo."
      : "Resultado: taxa de aprovação abaixo do mínimo.",
    "",
  );
  return lines.join("\n");
}
