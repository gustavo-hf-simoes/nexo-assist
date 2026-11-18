"use client";

import { MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface RailProps {
  name: string;
  // Conversas esperando um analista; aparece como contador no ícone de conversas.
  waitingCount: number;
  onLogout: () => void;
  leaving?: boolean;
}

export function Rail({ name, waitingCount, onLogout, leaving = false }: RailProps) {
  return (
    <nav aria-label="Console" className="flex h-full w-[68px] shrink-0 flex-col items-center gap-4 border-r border-line bg-surface py-4">
      <span aria-hidden className="font-serif text-2xl font-semibold text-brand">
        N
      </span>
      <span
        aria-current="page"
        aria-label={`Conversas, ${waitingCount} aguardando`}
        className="relative flex size-11 items-center justify-center rounded-xl bg-white text-brand shadow-[0_1px_2px_rgba(27,36,49,0.08)]"
      >
        <MessageSquare size={20} aria-hidden />
        {waitingCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white">
            {waitingCount}
          </span>
        ) : null}
      </span>
      <div className="mt-auto flex flex-col items-center gap-2">
        <Avatar name={name} size={36} />
        <button
          type="button"
          onClick={onLogout}
          disabled={leaving}
          className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-white disabled:opacity-60"
        >
          Sair
        </button>
      </div>
    </nav>
  );
}
