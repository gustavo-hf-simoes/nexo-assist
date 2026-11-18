"use client";

import { useState } from "react";
import { chipsFromTrace } from "@/components/chat/chat-parts";
import { DecisionDetails } from "@/components/chat/decision-details";
import type { UiTrace } from "@/components/chat/chat-types";

export interface DecisionInlineProps {
  trace: UiTrace;
  label?: string;
}

// Detalhe da decisão do agent, recolhido por padrão; reaproveita o DecisionDetails do chat do funcionário.
export function DecisionInline({ trace, label = "Ver decisão" }: DecisionInlineProps) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-brand underline-offset-2 hover:underline"
      >
        {label}
      </button>
      {open ? <DecisionDetails trace={trace} tools={chipsFromTrace(trace.tools)} /> : null}
    </div>
  );
}
