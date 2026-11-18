import type { MastraModelConfig } from "@mastra/core/llm";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

// Modelo padrão quando NEXO_AGENT_MODEL não está definido (Gemini Flash estável, via model router do Mastra).
export const DEFAULT_AGENT_MODEL = "google/gemini-3.8-flash";
export const SCRIPTED_MODEL_ID = "test/scripted";

type StreamPart = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer P>
  ? P
  : never;

// Um passo do roteiro = uma chamada ao modelo: texto, chamadas de tool, ou uma falha.
export type ScriptStep =
  | { text?: string; toolCalls?: ReadonlyArray<{ name: string; input: unknown }>; error?: never }
  | { error: string };

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

let script: ScriptStep[] = [];
let calls = 0;

export function setScript(steps: ScriptStep[]): void {
  script = [...steps];
  calls = 0;
}

// Quantas vezes o modelo roteirizado foi chamado desde o último setScript.
export function scriptedCallCount(): number {
  return calls;
}

function partsFor(step: Exclude<ScriptStep, { error: string }>, n: number): StreamPart[] {
  const parts: StreamPart[] = [{ type: "stream-start", warnings: [] }];
  if (step.text) {
    parts.push({ type: "text-start", id: `t${n}` }, { type: "text-delta", id: `t${n}`, delta: step.text }, { type: "text-end", id: `t${n}` });
  }
  const toolCalls = step.toolCalls ?? [];
  toolCalls.forEach((call, i) => {
    parts.push({ type: "tool-call", toolCallId: `call-${n}-${i}`, toolName: call.name, input: JSON.stringify(call.input) });
  });
  parts.push({
    type: "finish",
    finishReason: { unified: toolCalls.length > 0 ? "tool-calls" : "stop", raw: undefined },
    usage: USAGE,
  });
  return parts;
}

function scriptedModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: "test",
    modelId: "scripted",
    doStream: async () => {
      const n = calls;
      calls += 1;
      const step = script[n];
      if (!step) throw new Error("Roteiro do modelo esgotado.");
      if (step.error !== undefined) throw new Error(step.error);
      return { stream: convertArrayToReadableStream(partsFor(step, n)) };
    },
  });
}

export function resolveModel(id: string): MastraModelConfig {
  return id === SCRIPTED_MODEL_ID ? scriptedModel() : id;
}
