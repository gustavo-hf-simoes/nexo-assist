"use client";

import type { ConsoleFilter } from "@/server/conversations/console-queries";

const TABS: ReadonlyArray<{ id: ConsoleFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "for_you", label: "Para você" },
  { id: "with_agent", label: "Com o agent" },
  { id: "mine", label: "Minhas" },
];

export interface ConversationFiltersProps {
  value: ConsoleFilter;
  counts: Record<ConsoleFilter, number> | null;
  onChange: (filter: ConsoleFilter) => void;
}

export function ConversationFilters({ value, counts, onChange }: ConversationFiltersProps) {
  return (
    <div role="tablist" aria-label="Filtros" className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ${
              active ? "bg-brand-tint text-brand" : "bg-surface text-ink-soft hover:bg-line/60"
            }`}
          >
            {tab.label}
            {counts ? <span className="tabular-nums">{counts[tab.id]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
