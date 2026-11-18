"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftUi } from "./agent-message";
import { classifyChatError, type ClassifiedChatError } from "./chat-errors";
import { textOf } from "./chat-parts";
import { PAUSED_STATES, toChatMessage, type ChatMessage, type ConversationSnapshot, type DraftView } from "./chat-types";
import { Composer } from "./composer";
import { ErrorBanner } from "./error-banner";
import { MessageList } from "./message-list";
import { PausedBanner } from "./paused-banner";
import { SessionCounter } from "./session-counter";

const POLL_INTERVAL_MS = 3000;
const SNAPSHOT_URL = "/api/conversations/current";

function lastUserText(messages: readonly ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user") return textOf(message);
  }
  return "";
}

async function errorTextOf(response: Response, fallback: string): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return fallback;
}

async function fetchSnapshot(): Promise<ConversationSnapshot> {
  const response = await fetch(SNAPSHOT_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as ConversationSnapshot;
}

export function ChatView() {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [chatError, setChatError] = useState<ClassifiedChatError | null>(null);
  const [input, setInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [draftOverrides, setDraftOverrides] = useState<Record<string, DraftView["status"]>>({});
  const [usedExtra, setUsedExtra] = useState(0);

  const lastSentRef = useRef("");
  const refreshRef = useRef<(replace: boolean) => Promise<void>>(async () => undefined);
  const statusRef = useRef<string>("ready");
  const inFlightRef = useRef(false);
  const busyRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: "/api/chat",
        // O servidor guarda o histórico: o cliente manda só o texto novo.
        prepareSendMessagesRequest: ({ messages }) => ({ body: { text: lastUserText(messages) } }),
      }),
    [],
  );

  const { messages, setMessages, sendMessage, status } = useChat<ChatMessage>({
    transport,
    onFinish: ({ isError }) => {
      void refreshRef.current(!isError);
    },
    onError: (error) => {
      const classified = classifyChatError(error);
      setChatError(classified);
      if (classified.kind === "paused" || classified.kind === "quota" || classified.kind === "daily_limit") {
        void refreshRef.current(true);
      }
    },
  });
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Aplica o estado do servidor. `replace` troca as mensagens locais pelas persistidas
  // (com trace e partes finais); durante um stream nunca substitui.
  const apply = useCallback(
    (data: ConversationSnapshot, replace: boolean) => {
      setSnapshot(data);
      setUsedExtra(0);
      setDraftOverrides({});
      setLoadError(false);
      if (replace && statusRef.current !== "streaming" && statusRef.current !== "submitted") {
        setMessages(data.messages.map(toChatMessage));
      }
    },
    [setMessages],
  );

  const refresh = useCallback(
    async (replace: boolean) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        apply(await fetchSnapshot(), replace);
      } catch {
        setLoadError(true);
      } finally {
        inFlightRef.current = false;
      }
    },
    [apply],
  );
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    fetchSnapshot()
      .then((data) => {
        if (!cancelled) apply(data, true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Polling só enquanto o analista está com a conversa; para ao desmontar e quando volta ao agent.
  const state = snapshot?.conversation.state ?? "agent";
  const paused = PAUSED_STATES.includes(state);
  useEffect(() => {
    if (!paused) return;
    const timer = setInterval(() => {
      void refreshRef.current(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const busy = status === "submitted" || status === "streaming";
  const used = (snapshot?.quota.used ?? 0) + usedExtra;
  const limit = snapshot?.quota.limit ?? 30;
  const limitReached = snapshot !== null && used >= limit;

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || statusRef.current === "streaming" || statusRef.current === "submitted") return;
      lastSentRef.current = trimmed;
      setChatError(null);
      setUsedExtra((n) => n + 1);
      void sendMessage({ text: trimmed });
    },
    [sendMessage],
  );

  const submit = useCallback(() => {
    const text = input;
    if (!text.trim()) return;
    setInput("");
    send(text);
  }, [input, send]);

  const retry = useCallback(() => {
    const text = lastSentRef.current;
    if (!text) return;
    // Tira a mensagem que falhou antes de reenviar, para não duplicá-la na tela.
    setMessages((current) => (current[current.length - 1]?.role === "user" ? current.slice(0, -1) : current));
    setUsedExtra((n) => Math.max(0, n - 1));
    send(text);
  }, [send, setMessages]);

  const runDraftAction = useCallback(async (id: string, action: "confirm" | "cancel") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(id);
    setDraftErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    try {
      const response = await fetch(`/api/drafts/${id}/${action}`, { method: "POST" });
      if (response.ok) {
        setDraftOverrides((current) => ({ ...current, [id]: action === "confirm" ? "confirmed" : "cancelled" }));
        await refreshRef.current(true);
      } else {
        const message = await errorTextOf(response, "Não consegui concluir agora. Tente novamente.");
        setDraftErrors((current) => ({ ...current, [id]: message }));
        // 409: o rascunho já mudou no servidor; mostra o estado real.
        if (response.status === 409) await refreshRef.current(true);
      }
    } catch {
      setDraftErrors((current) => ({ ...current, [id]: "Não consegui falar com o servidor. Verifique sua conexão." }));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }, []);

  const draftUi: DraftUi = useMemo(
    () => ({
      busyId,
      errors: draftErrors,
      onConfirm: (id) => void runDraftAction(id, "confirm"),
      onCancel: (id) => void runDraftAction(id, "cancel"),
      onEdit: (draft) => setInput(`Quero corrigir o rascunho: ${draft.title} — ${draft.description}`),
    }),
    [busyId, draftErrors, runDraftAction],
  );

  const drafts = useMemo(() => {
    const map: Record<string, DraftView> = {};
    for (const draft of snapshot?.drafts ?? []) {
      const override = draftOverrides[draft.id];
      map[draft.id] = override ? { ...draft, status: override } : draft;
    }
    return map;
  }, [snapshot, draftOverrides]);

  const lastMessage = messages[messages.length - 1];
  const thinking = busy && !(lastMessage?.role === "assistant" && textOf(lastMessage).length > 0);

  let disabledReason: string | undefined;
  if (limitReached) disabledReason = "Limite de mensagens da sessão atingido.";
  else if (paused) disabledReason = "Um analista está com a conversa. Aguarde o retorno dele.";

  return (
    <div className="mx-auto flex h-full w-full max-w-[780px] flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {snapshot === null && !loadError ? (
          <p role="status" className="py-10 text-center text-sm text-muted">
            Carregando a conversa…
          </p>
        ) : (
          <MessageList messages={messages} drafts={drafts} draftUi={draftUi} thinking={thinking} onChoose={send} />
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-6 pb-5">
        {paused ? <PausedBanner state={state} reason={snapshot?.conversation.handoffReason ?? null} /> : null}
        {loadError ? (
          <ErrorBanner
            error={{ kind: "network", message: "Não consegui carregar a conversa.", retry: true }}
            onRetry={() => void refresh(true)}
          />
        ) : null}
        {chatError ? <ErrorBanner error={chatError} onRetry={retry} onDismiss={() => setChatError(null)} /> : null}
        <Composer
          value={input}
          onChange={setInput}
          onSend={submit}
          disabled={snapshot === null || limitReached || paused || busy}
          {...(disabledReason ? { disabledReason } : {})}
        />
        <SessionCounter used={used} limit={limit} />
      </div>
    </div>
  );
}
