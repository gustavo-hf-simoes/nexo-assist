export type StatusTone = "ok" | "warn" | "danger" | "muted";
type Tone = StatusTone;

const DOT: Record<Tone, string> = { ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", muted: "bg-muted" };
const TEXT: Record<Tone, string> = { ok: "text-ok-ink", warn: "text-warn-ink", danger: "text-danger", muted: "text-muted" };

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TEXT[tone]}`}>
      <span aria-hidden className={`size-2 rounded-full ${DOT[tone]}`} />
      {label}
    </span>
  );
}
