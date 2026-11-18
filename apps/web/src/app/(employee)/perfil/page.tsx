import { PRIORITY_LABEL, type TicketDto } from "@nexo/domain";
import { eq } from "drizzle-orm";
import { Suspense } from "react";
import { STATUS_LABEL, statusTone } from "@/components/chat/status-labels";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { formatShortDate } from "@/lib/format";
import { requireEmployeePage } from "@/server/auth/page-guard";
import { getDb } from "@/server/db/app-db";
import { users } from "@/server/db/schema";
import { createTicketGateway } from "@/server/tickets/ticket-gateway-factory";

export const metadata = { title: "Meu perfil · Nexo Assist" };

async function loadTickets(userId: string): Promise<TicketDto[] | null> {
  try {
    return await createTicketGateway().listMine(userId, "all");
  } catch {
    return null;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-line px-5 py-3.5 last:border-b-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[14px] text-ink">{value}</dd>
    </div>
  );
}

async function ProfileContent() {
  const session = await requireEmployeePage();
  const [profile] = await getDb().select().from(users).where(eq(users.id, session.userId)).limit(1);
  const tickets = await loadTickets(session.userId);
  const device = [profile?.deviceModel, profile?.deviceOs].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto w-full max-w-[780px] px-6 py-8">
      <h1 className="font-serif text-[32px] font-medium leading-tight text-ink">Meu perfil</h1>
      <p className="mt-1 text-[14.5px] text-muted">Seus dados de acesso ao service desk de TI.</p>

      <Card className="mt-6">
        <dl>
          <Row label="Nome" value={profile?.name ?? session.name} />
          <Row label="E-mail corporativo" value={profile?.email ?? session.email} />
          <Row label="Departamento" value={profile?.department ?? "—"} />
          <Row label="Equipamento" value={device || "—"} />
        </dl>
        <p className="border-t border-line bg-surface px-5 py-2.5 text-xs text-muted">Gerenciado pela TI</p>
      </Card>

      <h2 className="mt-10 text-lg font-semibold text-ink">Meus chamados</h2>
      {tickets === null ? (
        <p role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn-ink">
          Não consegui carregar seus chamados agora porque o serviço de chamados está indisponível. Tente novamente em instantes.
        </p>
      ) : tickets.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Você ainda não abriu nenhum chamado.</p>
      ) : (
        <Card className="mt-3 overflow-hidden">
          <ul>
            {tickets.map((ticket) => (
              <li key={ticket.code} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                <span className="font-mono text-xs font-semibold text-ink">{ticket.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{ticket.title}</span>
                <span className="text-xs text-muted">{PRIORITY_LABEL[ticket.priority]}</span>
                <StatusDot tone={statusTone(ticket.status)} label={STATUS_LABEL[ticket.status]} />
                <span className="text-xs text-muted">{formatShortDate(ticket.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function PerfilPage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  );
}
