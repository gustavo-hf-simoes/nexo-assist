import { PRIORITY_LABEL, type TicketDto } from "@nexo/domain";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABEL, statusTone } from "./status-labels";

export interface TicketCardData {
  ticket: TicketDto;
  dueAt?: string | undefined;
  overdue?: boolean | undefined;
  slaLabel?: string | undefined;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

export function TicketCard({ ticket, dueAt, overdue, slaLabel }: TicketCardData) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Chamado · {ticket.code}</p>
        <StatusDot tone={statusTone(ticket.status)} label={STATUS_LABEL[ticket.status]} />
      </div>
      <h3 className="mt-2 text-[18px] font-semibold leading-[23px] text-ink">{ticket.title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-5 text-ink-soft">{ticket.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-4">
        <Field label="Categoria">{ticket.category}</Field>
        <Field label="Prioridade">{PRIORITY_LABEL[ticket.priority]}</Field>
        <Field label="Aberto em">{formatDateTime(ticket.createdAt)}</Field>
        <Field label="Prazo">
          {dueAt ? formatDateTime(dueAt) : "—"}
          {overdue ? <span className="font-medium text-danger"> · prazo vencido</span> : null}
          {slaLabel ? <span className="block text-xs text-muted">{slaLabel}</span> : null}
        </Field>
      </dl>
    </Card>
  );
}
