import { z } from "zod";
import type { ToolId } from "../src/server/agent/tools/action-labels";
import type { Intent } from "../src/server/agent/request-context";
import type { HandoffReason } from "../src/server/conversations/conversation-state";
import type { DraftView } from "../src/server/drafts/draft-types";
import type { Scenario } from "./scenarios";

export interface ObservedToolCall {
  id: ToolId;
  input: unknown;
  ok: boolean;
}

// O que o runner observou numa conversa; a pontuação não sabe de onde isso veio (LLM real ou roteiro).
export interface Observed {
  toolCalls: ObservedToolCall[];
  intent: Intent | undefined;
  draft: DraftView | undefined;
  handoff: HandoffReason | undefined;
  answer: string;
}

export interface ScenarioResult {
  passed: boolean;
  reasons: string[];
}

export const DEFAULT_MIN_PASS_RATE = 0.9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function matchesArgs(input: unknown, args: Record<string, unknown>): boolean {
  if (!isRecord(input)) return false;
  return Object.entries(args).every(([key, value]) => input[key] === value);
}

function includesText(answer: string, fragment: string): boolean {
  return answer.toLowerCase().includes(fragment.toLowerCase());
}

export function scoreScenario(scenario: Scenario, observed: Observed): ScenarioResult {
  const expected = scenario.expect;
  const reasons: string[] = [];
  const called = new Set(observed.toolCalls.map((c) => c.id));

  for (const tool of expected.tools ?? []) {
    if (!called.has(tool)) reasons.push(`tool esperada e não chamada: ${tool}`);
  }
  for (const tool of expected.forbiddenTools ?? []) {
    if (called.has(tool)) reasons.push(`tool proibida foi chamada: ${tool}`);
  }
  for (const { tool, args } of expected.toolArgs ?? []) {
    const matched = observed.toolCalls.some((c) => c.id === tool && matchesArgs(c.input, args));
    if (!matched) reasons.push(`nenhuma chamada de ${tool} com ${JSON.stringify(args)}`);
  }
  if (expected.intent !== undefined && observed.intent !== expected.intent) {
    reasons.push(`intenção esperada ${expected.intent}, observada ${observed.intent ?? "nenhuma"}`);
  }
  if (expected.draft !== undefined) {
    if (!observed.draft) {
      reasons.push("esperava um rascunho, mas nenhum foi montado");
    } else {
      for (const [key, value] of Object.entries(expected.draft)) {
        const actual = (observed.draft as unknown as Record<string, unknown>)[key];
        if (actual !== value) {
          reasons.push(`rascunho: ${key} esperado ${JSON.stringify(value)}, observado ${JSON.stringify(actual)}`);
        }
      }
    }
  }
  if (expected.handoff !== undefined && observed.handoff !== expected.handoff) {
    reasons.push(`transferência esperada ${expected.handoff}, observada ${observed.handoff ?? "nenhuma"}`);
  }
  for (const fragment of expected.answerIncludes ?? []) {
    if (!includesText(observed.answer, fragment)) reasons.push(`a resposta deveria conter "${fragment}"`);
  }
  for (const fragment of expected.answerExcludes ?? []) {
    if (includesText(observed.answer, fragment)) reasons.push(`a resposta não deveria conter "${fragment}"`);
  }
  return { passed: reasons.length === 0, reasons };
}

export function passRate(results: ReadonlyArray<{ passed: boolean }>): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.passed).length / results.length;
}

export function meetsThreshold(rate: number, minRate: number): boolean {
  return rate >= minRate;
}

const MinPassRateSchema = z.coerce.number().min(0).max(1);

// EVAL_MIN_PASS_RATE fica fora de env.ts de propósito: só o eval a usa, e o app não deve exigi-la.
export function parseMinPassRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MIN_PASS_RATE;
  const parsed = MinPassRateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`EVAL_MIN_PASS_RATE inválida ("${raw}"): use um número de 0 a 1.`);
  return parsed.data;
}
