// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationSnapshot } from "@/components/chat/chat-types";
import { ChatView } from "@/components/chat/chat-view";
import { DRAFT } from "./fixtures";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function emptySnapshot(): ConversationSnapshot {
  return { conversation: { id: "c1", state: "agent", handoffReason: null }, messages: [], quota: { used: 0, limit: 30 }, drafts: [] };
}

function snapshotWithDraft(): ConversationSnapshot {
  return {
    conversation: { id: "c1", state: "agent", handoffReason: null },
    messages: [
      {
        id: "m1",
        role: "assistant",
        author: "agent",
        createdAt: "2026-11-18T14:00:00.000Z",
        parts: [
          { type: "text", text: "Montei o rascunho." },
          { type: "tool-prepare_ticket_draft", toolCallId: "t1", state: "output-available", input: {}, output: { ok: true, draft: DRAFT } },
        ],
      },
    ],
    quota: { used: 1, limit: 30 },
    drafts: [DRAFT],
  } as ConversationSnapshot;
}

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function stub(handlers: { snapshot?: () => ConversationSnapshot; chat?: Handler; drafts?: Handler }) {
  const snapshot = handlers.snapshot ?? emptySnapshot;
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/conversations/current")) return json(snapshot());
    if (url === "/api/chat") return handlers.chat ? handlers.chat(init) : json({ error: "x" }, 500);
    if (url.startsWith("/api/drafts/")) return handlers.drafts ? handlers.drafts(init) : json({}, 200);
    throw new Error(`fetch inesperado: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const chatCalls = (fn: ReturnType<typeof stub>) => fn.mock.calls.filter(([url]) => String(url) === "/api/chat");

async function send(text: string) {
  const box = await screen.findByRole("textbox", { name: "Mensagem" });
  await waitFor(() => expect(box).toBeEnabled());
  await userEvent.type(box, text);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatView: envio e erros", () => {
  it("envia POST /api/chat com só { text }", async () => {
    const fn = stub({ chat: () => json({ error: "daily_limit" }, 429) });
    render(<ChatView />);
    await send("Meu notebook não liga");
    await waitFor(() => expect(chatCalls(fn)).toHaveLength(1));
    const init = chatCalls(fn)[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ text: "Meu notebook não liga" });
  });

  it("erro de rede mostra o banner e 'Tentar de novo' reenvia o mesmo texto", async () => {
    const fn = stub({
      chat: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    render(<ChatView />);
    await send("Preciso de ajuda");
    expect(await screen.findByText("Não consegui falar com o servidor. Verifique sua conexão.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(chatCalls(fn)).toHaveLength(2));
    const bodies = chatCalls(fn).map(([, init]) => JSON.parse(String(init?.body)) as unknown);
    expect(bodies).toEqual([{ text: "Preciso de ajuda" }, { text: "Preciso de ajuda" }]);
    // A mensagem que falhou não fica duplicada na tela.
    expect(screen.getAllByText("Preciso de ajuda")).toHaveLength(1);
  });

  it("409 mostra o aviso de conversa assumida pelo analista, sem retry", async () => {
    stub({ chat: () => json({ state: "analyst" }, 409) });
    render(<ChatView />);
    await send("Oi");
    expect(await screen.findByText(/Um analista assumiu a conversa/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("429 de cota mostra o limite da sessão", async () => {
    stub({ chat: () => json({ error: "quota_exceeded" }, 429) });
    render(<ChatView />);
    await send("Oi");
    expect(await screen.findByText("Você atingiu o limite de 30 mensagens desta sessão.")).toBeInTheDocument();
  });

  it("429 de limite diário mostra a mensagem do dia", async () => {
    stub({ chat: () => json({ error: "daily_limit" }, 429) });
    render(<ChatView />);
    await send("Oi");
    expect(await screen.findByText(/limite diário de respostas/)).toBeInTheDocument();
  });
});

describe("ChatView: ações do rascunho", () => {
  it("Confirmar com 409 mostra a mensagem pt-BR do servidor", async () => {
    const fn = stub({ snapshot: snapshotWithDraft, drafts: () => json({ error: "Este rascunho não está mais pendente." }, 409) });
    render(<ChatView />);
    await userEvent.click(await screen.findByRole("button", { name: /Confirmar/ }));
    expect(await screen.findByText("Este rascunho não está mais pendente.")).toBeInTheDocument();
    expect(fn).toHaveBeenCalledWith("/api/drafts/d1/confirm", { method: "POST" });
  });

  it("Confirmar com 503 mostra a indisponibilidade e mantém o botão para tentar de novo", async () => {
    stub({
      snapshot: snapshotWithDraft,
      drafts: () => json({ error: "O serviço de chamados está indisponível no momento. Tente confirmar novamente em instantes." }, 503),
    });
    render(<ChatView />);
    await userEvent.click(await screen.findByRole("button", { name: /Confirmar/ }));
    expect(await screen.findByText(/serviço de chamados está indisponível/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar/ })).toBeEnabled();
  });

  it("Cancelar com 409 também mostra o erro", async () => {
    const fn = stub({ snapshot: snapshotWithDraft, drafts: () => json({ error: "Este rascunho não está mais pendente." }, 409) });
    render(<ChatView />);
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText("Este rascunho não está mais pendente.")).toBeInTheDocument();
    expect(fn).toHaveBeenCalledWith("/api/drafts/d1/cancel", { method: "POST" });
  });

  it("falha de rede ao confirmar mostra o erro de conexão", async () => {
    stub({
      snapshot: snapshotWithDraft,
      drafts: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    render(<ChatView />);
    await userEvent.click(await screen.findByRole("button", { name: /Confirmar/ }));
    expect(await screen.findByText("Não consegui falar com o servidor. Verifique sua conexão.")).toBeInTheDocument();
  });

  it("Editar preenche o composer com o texto de correção do rascunho", async () => {
    stub({ snapshot: snapshotWithDraft });
    render(<ChatView />);
    await userEvent.click(await screen.findByRole("button", { name: "Editar" }));
    expect(screen.getByRole("textbox", { name: "Mensagem" })).toHaveValue(
      `Quero corrigir o rascunho: ${DRAFT.title} — ${DRAFT.description}`,
    );
  });
});
