// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "@/components/chat/chat-view";
import type { ConversationSnapshot } from "@/components/chat/chat-types";

function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    conversation: { id: "c1", state: "agent", handoffReason: null },
    messages: [],
    quota: { used: 3, limit: 30 },
    drafts: [],
    ...overrides,
  };
}

function stubFetch(next: () => ConversationSnapshot) {
  const fn = vi.fn(
    async () => new Response(JSON.stringify(next()), { status: 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  // jsdom não implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ChatView", () => {
  it("em 30/30 desabilita o composer com a mensagem de limite", async () => {
    stubFetch(() => snapshot({ quota: { used: 30, limit: 30 } }));
    render(<ChatView />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("limite de 30 mensagens"));
    expect(screen.getByRole("textbox", { name: "Mensagem" })).toBeDisabled();
  });

  it("com o analista mostra o banner e o nome dele nas mensagens", async () => {
    stubFetch(() =>
      snapshot({
        conversation: { id: "c1", state: "analyst", handoffReason: null },
        messages: [
          {
            id: "m1",
            role: "assistant",
            author: "analyst",
            authorName: "Rafael Lima",
            createdAt: "2026-11-18T14:00:00.000Z",
            parts: [{ type: "text", text: "Olá!" }],
          },
        ],
      }),
    );
    render(<ChatView />);
    expect(await screen.findByText("Analista atendendo")).toBeInTheDocument();
    expect(screen.getByText("Rafael Lima")).toBeInTheDocument();
  });

  it("faz polling a cada 3 s só enquanto pausada e para ao desmontar", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchFn = stubFetch(() => snapshot({ conversation: { id: "c1", state: "waiting_analyst", handoffReason: null } }));
    const { unmount } = render(<ChatView />);
    await screen.findByText("Um analista vai falar com você");
    const afterLoad = fetchFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(fetchFn.mock.calls.length).toBeGreaterThan(afterLoad);
    unmount();
    const afterUnmount = fetchFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(fetchFn.mock.calls.length).toBe(afterUnmount);
  });

  it("não faz polling com o agent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchFn = stubFetch(() => snapshot());
    render(<ChatView />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    const afterLoad = fetchFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });
    expect(fetchFn.mock.calls.length).toBe(afterLoad);
  });
});
