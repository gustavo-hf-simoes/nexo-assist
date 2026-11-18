"use client";

import type { KeyboardEvent } from "react";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  disabledReason?: string;
  placeholder?: string;
}

export function Composer({ value, onChange, onSend, disabled = false, disabledReason, placeholder = "Descreva o que está acontecendo…" }: ComposerProps) {
  const canSend = !disabled && value.trim().length > 0;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+Enter pertence à confirmação do rascunho.
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  }

  return (
    <div className={`flex items-end gap-2 rounded-2xl border border-line bg-white p-2.5 ${disabled ? "opacity-70" : ""}`}>
      <textarea
        aria-label="Mensagem"
        rows={2}
        value={value}
        disabled={disabled}
        placeholder={disabledReason && disabled ? disabledReason : placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1 text-[14.5px] text-ink outline-none placeholder:text-muted"
      />
      <button
        type="button"
        disabled={!canSend}
        onClick={onSend}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-brand/40"
      >
        Enviar
        <span aria-hidden>↑</span>
      </button>
      {disabled && disabledReason ? <span className="sr-only">{disabledReason}</span> : null}
    </div>
  );
}
