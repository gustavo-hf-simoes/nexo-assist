"use client";

import { useState } from "react";
import type { ChipTool, UiTrace } from "./chat-types";
import { DecisionDetails } from "./decision-details";

export function ActionChips({ tools, trace }: { tools: ChipTool[]; trace?: UiTrace | undefined }) {
  const [open, setOpen] = useState(false);
  const chips = tools.flatMap((tool) => tool.labels.map((label, i) => ({ key: `${tool.id}-${i}`, label })));
  if (chips.length === 0 && !trace) return null;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok-ink">
            <span aria-hidden>✓</span>
            {chip.label}
          </span>
        ))}
        {trace ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium text-brand-link underline-offset-2 hover:underline"
          >
            Ver detalhes
          </button>
        ) : null}
      </div>
      {open && trace ? <DecisionDetails trace={trace} tools={tools} /> : null}
    </div>
  );
}
