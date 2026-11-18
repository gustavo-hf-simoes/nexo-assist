"use client";

import type { TicketDto } from "@nexo/domain";
import { StatusDot } from "@/components/ui/status-dot";
import { formatShortDate } from "@/lib/format";
import { STATUS_LABEL, statusTone } from "./status-labels";

export interface ChoiceOption {
  label: string;
  value: string;
  ticket?: TicketDto | undefined;
}

export interface TicketChoiceListProps {
  question: string;
  options: ChoiceOption[];
  disabled?: boolean;
  onChoose: (text: string) => void;
}

export function TicketChoiceList({ question, options, disabled = false, onChoose }: TicketChoiceListProps) {
  return (
    <fieldset className="rounded-xl border border-line bg-white">
      <legend className="sr-only">{question}</legend>
      <p className="border-b border-line px-4 py-2.5 text-[13.5px] font-medium text-ink">{question}</p>
      <ul>
        {options.map((option) => (
          <li key={option.value} className="border-b border-line last:border-b-0">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChoose(option.label)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden className="size-4 shrink-0 rounded-full border border-line" />
              {option.ticket ? (
                <>
                  <span className="font-mono text-xs font-semibold text-ink">{option.ticket.code}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{option.ticket.title}</span>
                  <StatusDot tone={statusTone(option.ticket.status)} label={STATUS_LABEL[option.ticket.status]} />
                  <span className="text-xs text-muted">{formatShortDate(option.ticket.createdAt)}</span>
                </>
              ) : (
                <span className="text-[13.5px] text-ink">{option.label}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
