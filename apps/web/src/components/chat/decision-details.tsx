import { summarizeValue } from "@/lib/format";
import type { ChipTool, UiTrace } from "./chat-types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-[13px] text-ink-soft">{children}</dd>
    </div>
  );
}

export function DecisionDetails({ trace, tools }: { trace: UiTrace; tools: ChipTool[] }) {
  const confidence = trace.confidence === null ? "—" : `${Math.round(trace.confidence * 100)}%`;
  return (
    <section aria-label="Detalhes da decisão" className="mt-2 rounded-xl border border-line bg-surface p-3.5">
      <dl className="flex flex-col gap-2">
        <Row label="Entendimento">{trace.understanding}</Row>
        <Row label="Ação">{trace.action}</Row>
        <Row label="Confiança">{confidence}</Row>
        <Row label="Motivo">{trace.rationale}</Row>
      </dl>
      {tools.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          {tools.map((tool, index) => (
            <li key={`${tool.id}-${index}`} className="text-[12.5px] text-ink-soft">
              <span className="font-mono font-semibold text-ink">{tool.id}</span>
              <div className="mt-0.5 break-words">
                <span className="text-muted">entrada: </span>
                <code className="font-mono">{summarizeValue(tool.input)}</code>
              </div>
              <div className="break-words">
                <span className="text-muted">resultado: </span>
                <code className="font-mono">{summarizeValue(tool.output)}</code>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
