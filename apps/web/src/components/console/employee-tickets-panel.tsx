import { isOpenStatus, PRIORITY_LABEL, type TicketDto } from "@nexo/domain";
import { STATUS_LABEL, statusTone } from "@/components/chat/status-labels";
import { StatusDot } from "@/components/ui/status-dot";
import { formatShortDate } from "@/lib/format";

export interface EmployeeTicketsPanelProps {
  employeeFirstName: string;
  tickets: TicketDto[] | null;
  error: string | null;
  linkedTicketCode: string | null;
}

function TicketRow({ ticket }: { ticket: TicketDto }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-medium text-ink">{ticket.title}</p>
        <p className="text-xs text-muted">
          {ticket.code} · {formatShortDate(ticket.createdAt)}
        </p>
      </div>
      <StatusDot tone={statusTone(ticket.status)} label={STATUS_LABEL[ticket.status]} />
    </li>
  );
}

export function EmployeeTicketsPanel({ employeeFirstName, tickets, error, linkedTicketCode }: EmployeeTicketsPanelProps) {
  const open = tickets?.filter((t) => isOpenStatus(t.status)).length ?? 0;
  const closed = (tickets?.length ?? 0) - open;
  const linked = tickets?.find((t) => t.code === linkedTicketCode) ?? null;
  const others = tickets?.filter((t) => t.code !== linkedTicketCode) ?? [];
  return (
    <aside aria-label={`Chamados de ${employeeFirstName}`} className="flex h-full w-[330px] shrink-0 flex-col overflow-y-auto border-l border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[17px] font-semibold text-ink">Chamados da {employeeFirstName}</h2>
        {tickets ? (
          <p className="text-[13px] text-muted">
            {open} {open === 1 ? "aberto" : "abertos"} · {closed} {closed === 1 ? "encerrado" : "encerrados"}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-5 px-5 py-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-warn/10 px-3 py-2.5 text-[13px] text-warn-ink">
            {error}
          </p>
        ) : null}
        {tickets && tickets.length === 0 ? <p className="text-sm text-muted">Nenhum chamado.</p> : null}
        {linked ? (
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">Desta conversa</h3>
            <div className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{linked.code}</span>
                <StatusDot tone={statusTone(linked.status)} label={STATUS_LABEL[linked.status]} />
              </div>
              <p className="mt-1 text-[15px] font-semibold text-ink">{linked.title}</p>
              <p className="text-[13px] text-muted">
                {linked.category} · prioridade {PRIORITY_LABEL[linked.priority].toLowerCase()}
              </p>
            </div>
          </section>
        ) : null}
        {others.length > 0 ? (
          <section>
            <h3 className="mb-1 text-[13px] font-semibold text-ink-soft">Outros chamados</h3>
            <ul>
              {others.map((ticket) => (
                <TicketRow key={ticket.code} ticket={ticket} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
