import type { ChatMessage, DraftView, UiTrace } from "@/components/chat/chat-types";

export const TRACE: UiTrace = {
  intent: "ticket_create",
  understanding: "VPN não conecta (erro 809) no Windows 11.",
  action: "Montar rascunho de chamado",
  confidence: 0.41,
  rationale: "O artigo da central vale só para Windows 10.",
  model: "test/scripted",
  latencyMs: 120,
  tools: [
    {
      id: "search_my_tickets",
      labels: ["consultou seus chamados"],
      ok: true,
      input: { scope: "open", text: "vpn" },
      output: { ok: true, tickets: [] },
    },
    {
      id: "search_help_center",
      labels: ["buscou na central de ajuda"],
      ok: true,
      input: { query: "vpn erro 809" },
      output: { ok: true, articles: [{ slug: "vpn-erro-809" }] },
    },
  ],
};

export const DRAFT: DraftView = {
  id: "d1",
  displayCode: "D-381",
  kind: "create",
  title: "VPN não conecta no notebook — erro 809",
  description: "Desde ontem o notebook não conecta na VPN.",
  type: "INC",
  category: "Rede e VPN",
  priority: "alta",
  priorityReason: "Bloqueia o trabalho.",
  dueAt: "2026-11-18T16:43:00.000Z",
  affectedLabel: "Somente você",
  status: "pending",
};

export const NOW = new Date("2026-11-18T14:00:00.000Z");

export function analystMessage(): ChatMessage {
  return {
    id: "m-analyst",
    role: "assistant",
    parts: [{ type: "text", text: "Oi Ana, já estou olhando o seu chamado." }],
    metadata: { author: "analyst", authorName: "Rafael Lima" },
  };
}
