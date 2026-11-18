import type { ReactNode } from "react";

type Tone = "neutral" | "ok" | "warn" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface text-ink-soft",
  ok: "bg-ok/10 text-ok-ink",
  warn: "bg-warn/15 text-warn-ink",
  brand: "bg-brand-tint text-brand",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}
