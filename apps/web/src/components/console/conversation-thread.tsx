"use client";

import { useEffect, useRef } from "react";
import { textOf } from "@/components/chat/chat-parts";
import { toChatMessage } from "@/components/chat/chat-types";
import { formatTime, handoffReasonLabel } from "@/lib/format";
import type { ConsoleDetail } from "@/server/conversations/console-queries";
import type { UiMessage } from "@/server/conversations/ui-messages";
import { DecisionInline } from "./decision-inline";

function Time({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="ml-2 text-[11px] opacity-70">
      {formatTime(iso)}
    </time>
  );
}

function MessageRow({ message }: { message: UiMessage }) {
  const text = textOf(toChatMessage(message));
  if (message.author === "system") {
    return (
      <p className="self-center rounded-full bg-white px-3.5 py-1 text-xs font-medium text-ink-soft">
        {text} · {formatTime(message.createdAt)}
      </p>
    );
  }
  if (message.author === "employee") {
    return (
      <div className="flex max-w-[75%] flex-col items-start gap-1 self-start">
        <p className="whitespace-pre-wrap rounded-[4px_14px_14px_14px] border border-line bg-white px-4 py-2.5 text-[14.5px] leading-[22px] text-ink">
          {text}
          <Time iso={message.createdAt} />
        </p>
      </div>
    );
  }
  const isAgent = message.author === "agent";
  if (isAgent && text === "" && !message.trace) return null;
  return (
    <div className="flex max-w-[75%] flex-col items-end gap-1 self-end">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft">
        {isAgent ? "Nexo Assist" : (message.authorName ?? "Analista")}
        {isAgent ? <span className="rounded bg-brand-tint px-1.5 text-[11px] font-semibold text-brand">IA</span> : null}
      </div>
      {text ? (
        <p
          className={`whitespace-pre-wrap rounded-[14px_4px_14px_14px] px-4 py-2.5 text-[14.5px] leading-[22px] ${
            isAgent ? "border border-brand/10 bg-brand-tint text-ink" : "bg-brand text-white"
          }`}
        >
          {text}
          <Time iso={message.createdAt} />
        </p>
      ) : null}
      {isAgent && message.trace ? <DecisionInline trace={message.trace} /> : null}
    </div>
  );
}

export function ConversationThread({ detail }: { detail: ConsoleDetail }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = detail.messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [count, detail.conversation.id]);

  const { handoff } = detail;
  const showHandoff = Boolean(handoff.summary || handoff.reason);
  return (
    <div className="flex-1 overflow-y-auto bg-surface px-6 py-5">
      <div className="mx-auto flex max-w-[760px] flex-col gap-3.5" aria-live="polite">
        {showHandoff ? (
          <section aria-label="Resumo da transferência" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13.5px] text-warn-ink">
            <p className="font-semibold">Resumo da transferência</p>
            {handoff.summary ? <p className="mt-1 text-ink-soft">{handoff.summary}</p> : null}
            {handoff.reason ? <p className="mt-1 text-[13px] text-ink-soft">Motivo: {handoffReasonLabel(handoff.reason) ?? handoff.reason}</p> : null}
            {handoff.trace ? (
              <div className="mt-2">
                <DecisionInline trace={handoff.trace} label="Por que transferiu" />
              </div>
            ) : null}
          </section>
        ) : null}
        {count === 0 ? <p className="py-6 text-center text-sm text-muted">Nenhuma mensagem ainda.</p> : null}
        {detail.messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
