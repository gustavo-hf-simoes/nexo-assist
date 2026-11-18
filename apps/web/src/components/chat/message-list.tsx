"use client";

import { useEffect, useRef } from "react";
import { AgentMessage, type DraftUi } from "./agent-message";
import { textOf } from "./chat-parts";
import type { ChatMessage, DraftView } from "./chat-types";
import { EmployeeBubble } from "./employee-bubble";

export interface MessageListProps {
  messages: ChatMessage[];
  drafts: Record<string, DraftView>;
  draftUi: DraftUi;
  thinking: boolean;
  onChoose: (text: string) => void;
}

export function MessageList({ messages, drafts, draftUi, thinking, onChoose }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, thinking, last?.parts.length]);

  return (
    <div className="flex flex-col gap-5" aria-live="polite">
      {messages.length === 0 && !thinking ? (
        <p className="py-10 text-center text-[14.5px] text-muted">
          Olá! Descreva o que está acontecendo e eu consulto seus chamados e abro um novo se for preciso.
        </p>
      ) : null}
      {messages.map((message, index) => {
        if (message.role === "user") return <EmployeeBubble key={message.id} text={textOf(message)} />;
        if (message.role === "system") {
          return (
            <p key={message.id} className="self-center rounded-full bg-ok/10 px-3.5 py-1 text-xs font-medium text-ok-ink">
              {textOf(message)}
            </p>
          );
        }
        return (
          <AgentMessage
            key={message.id}
            message={message}
            drafts={drafts}
            draftUi={draftUi}
            active={index === messages.length - 1 && !thinking}
            onChoose={onChoose}
          />
        );
      })}
      {thinking ? (
        <p role="status" className="text-[13px] italic text-muted">
          Nexo está pensando…
        </p>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
