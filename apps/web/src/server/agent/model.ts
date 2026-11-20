import type { ModelWithRetries } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { parseModelChain } from "./provider-key";

// Modelo padrão quando NEXO_AGENT_MODEL não está definido: três modelos do plano gratuito da Groq, em cadeia,
// para somar as cotas diárias sem custo (ver ADR 0007).
export const DEFAULT_AGENT_MODEL = "groq/openai/gpt-oss-120b,groq/qwen/qwen3.8-27b,groq/openai/gpt-oss-20b";
export const SCRIPTED_MODEL_ID = "test/scripted";

type StreamPart = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer P>
  ? P
  : never;

// Um passo do roteiro = uma chamada ao modelo: texto, chamadas de tool, uma falha, ou um modelo que não
// responde (só termina quando o turno cancela a chamada).
type ReplyStep = { text?: string; toolCalls?: ReadonlyArray<{ name: string; input: unknown }>; error?: never; hang?: never };
export type ScriptStep = ReplyStep | { error: string; hang?: never } | { hang: true; error?: never };

const USAGE = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

// null = nenhum setScript: vale o roteiro padrão (por texto do usuário), usado pelo E2E.
let script: ScriptStep[] | null = null;
let calls = 0;

export function setScript(steps: ScriptStep[]): void {
  script = [...steps];
  calls = 0;
}

// Quantas vezes o modelo roteirizado foi chamado desde o último setScript.
export function scriptedCallCount(): number {
  return calls;
}

export const VPN_TRIGGER = "Meu notebook não conecta na VPN, erro 809";

type PromptMessage = { role: string; content: unknown };

function lastUserText(prompt: readonly PromptMessage[]): string {
  for (let i = prompt.length - 1; i >= 0; i -= 1) {
    const message = prompt[i];
    if (message?.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return (content as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n");
    }
  }
  return "";
}

// Resultados de tool já devolvidos neste turno (depois da última mensagem do usuário).
function turnToolResults(prompt: readonly PromptMessage[]): PromptMessage[] {
  let lastUser = -1;
  prompt.forEach((m, i) => {
    if (m.role === "user") lastUser = i;
  });
  return prompt.slice(lastUser + 1).filter((m) => m.role === "tool");
}

const DECISION_FALLBACK = {
  intent: "smalltalk",
  understanding: "Mensagem fora do roteiro de demonstração.",
  action: "Responder de forma simples",
  confidence: 0.9,
  rationale: "Roteiro padrão do modelo de teste.",
};

// Roteiro padrão: decide o próximo passo pelo texto do usuário e pelas tools já executadas no turno.
export function defaultStep(prompt: readonly PromptMessage[]): ReplyStep {
  const text = lastUserText(prompt);
  const results = turnToolResults(prompt);
  const done = results.length;
  if (text.trim() !== VPN_TRIGGER) {
    return done === 0
      ? { toolCalls: [{ name: "record_decision", input: DECISION_FALLBACK }] }
      : { text: "Olá! Sou o assistente de TI da Nexo. Descreva o problema e eu abro o chamado para você." };
  }
  if (done === 0) return { toolCalls: [{ name: "search_my_tickets", input: { scope: "open" } }] };
  if (done === 1) return { toolCalls: [{ name: "search_help_center", input: { query: "vpn erro 809" } }] };
  if (done === 2) {
    // Chamados já abertos aparecem no resultado da busca: não os trate como duplicata em reexecuções.
    const codes = [...new Set(JSON.stringify(results).match(/(?:INC|REQ)-\d+/g) ?? [])];
    return {
      toolCalls: [
        {
          name: "prepare_ticket_draft",
          input: {
            kind: "create",
            title: "VPN não conecta no notebook — erro 809",
            description: "O notebook não conecta na VPN e exibe o erro 809 desde hoje.",
            type: "INC",
            category: "Rede e VPN",
            impact: "individual",
            blocksWork: true,
            sameDayDeadline: false,
            affectedLabel: "Somente você",
            notDuplicateOf: codes,
          },
        },
      ],
    };
  }
  if (done === 3) {
    return {
      toolCalls: [
        {
          name: "record_decision",
          input: {
            intent: "ticket_create",
            understanding: "VPN não conecta (erro 809) no notebook.",
            action: "Montar rascunho de chamado",
            confidence: 0.82,
            rationale: "Sem chamado aberto sobre o tema e o artigo da central não resolve.",
          },
        },
      ],
    };
  }
  return { text: "Montei o rascunho do chamado abaixo. Confira os dados e confirme para eu abrir." };
}

function partsFor(step: ReplyStep, n: number): StreamPart[] {
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

// Modelo que não responde: a chamada só termina (com erro) quando o turno a cancela.
function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise<never>((_, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("Chamada ao modelo cancelada.")), { once: true });
  });
}

function scriptedModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    provider: "test",
    modelId: "scripted",
    doStream: async (options) => {
      const n = calls;
      calls += 1;
      const step = script === null ? defaultStep(options.prompt as readonly PromptMessage[]) : script[n];
      if (!step) throw new Error("Roteiro do modelo esgotado.");
      if (step.error !== undefined) throw new Error(step.error);
      if (step.hang) return waitForAbort(options.abortSignal);
      return { stream: convertArrayToReadableStream(partsFor(step, n)) };
    },
  });
}

// Uma lista vira a cadeia de fallback do Mastra. Sem retry no mesmo modelo: um 429 de cota gratuita
// não passa esperando, então o turno segue logo para o próximo e cabe no prazo de 45 s.
export function resolveModel(id: string): MastraModelConfig | ModelWithRetries[] {
  const ids = parseModelChain(id);
  if (ids.length > 1) return ids.map((model) => ({ model: resolveSingle(model), maxRetries: 0 }));
  return resolveSingle(ids[0] ?? id);
}

function resolveSingle(id: string): MastraModelConfig {
  return id === SCRIPTED_MODEL_ID ? scriptedModel() : id;
}
