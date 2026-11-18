"use client";

import { Avatar } from "@/components/ui/avatar";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { formatListTime } from "@/lib/format";
import type { ConversationSummary } from "@/server/conversations/console-queries";

const TONE: Record<ConversationSummary["badge"]["tone"], StatusTone> = {
  danger: "danger",
  warning: "warn",
  success: "ok",
  neutral: "muted",
};

export interface ConversationListProps {
  items: ConversationSummary[] | null;
  loading: boolean;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  searching: boolean;
}

export function ConversationList({ items, loading, error, selectedId, onSelect, onRetry, searching }: ConversationListProps) {
  if (loading) {
    return (
      <p role="status" className="px-5 py-8 text-center text-sm text-muted">
        Carregando conversas…
      </p>
    );
  }
  if (error && items === null) {
    return (
      <div role="alert" className="px-5 py-8 text-center text-sm text-ink-soft">
        <p>Não consegui carregar as conversas.</p>
        <button type="button" onClick={onRetry} className="mt-2 font-medium text-brand hover:underline">
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-muted">
        {searching ? "Nenhuma conversa encontrada para essa busca." : "Nenhuma conversa neste filtro."}
      </p>
    );
  }
  return (
    <ul aria-label="Conversas" className="flex flex-col">
      {error ? (
        <li role="alert" className="px-5 py-2 text-xs text-danger">
          Não consegui atualizar a lista. Mostrando os últimos dados.
        </li>
      ) : null}
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left ${selected ? "bg-surface" : "hover:bg-surface/60"}`}
            >
              <Avatar name={item.employee.name} size={44} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold text-ink">{item.employee.name}</span>
                  <time dateTime={item.lastMessageAt} className="shrink-0 text-xs text-muted">
                    {formatListTime(item.lastMessageAt)}
                  </time>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] text-ink-soft">{item.lastMessagePreview}</span>
                  {item.unreadForAnalyst > 0 ? (
                    <span
                      aria-label={`${item.unreadForAnalyst} não lidas`}
                      className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white"
                    >
                      {item.unreadForAnalyst}
                    </span>
                  ) : null}
                </span>
                <StatusDot tone={TONE[item.badge.tone]} label={item.badge.text} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
