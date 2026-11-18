"use client";

export interface QuickReply {
  label: string;
  value: string;
}

export interface QuickRepliesProps {
  question: string;
  options: QuickReply[];
  disabled?: boolean;
  onChoose: (text: string) => void;
}

export function QuickReplies({ question, options, disabled = false, onChoose }: QuickRepliesProps) {
  return (
    <div>
      <p className="text-[14.5px] leading-[22px] text-ink">{question}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option.label)}
            className="rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px] font-medium text-brand-link hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-60"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
