import type { ConversationState } from "@nexo/domain";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ConsoleEmployee } from "@/server/conversations/console-queries";

const STATE_PILL: Record<ConversationState, { label: string; tone: "warn" | "ok" | "brand" | "neutral" }> = {
  waiting_analyst: { label: "Aguardando atendente", tone: "warn" },
  analyst: { label: "Com analista", tone: "brand" },
  agent: { label: "Agent atendendo", tone: "ok" },
  closed: { label: "Encerrada", tone: "neutral" },
};

export function ConversationHeader({
  employee,
  state,
  linkedTicketCode,
}: {
  employee: ConsoleEmployee;
  state: ConversationState;
  linkedTicketCode: string | null;
}) {
  const pill = STATE_PILL[state];
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-white px-6 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={employee.name} size={44} />
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-semibold text-ink">{employee.name}</h2>
          <p className="truncate text-[13px] text-muted">
            {employee.department}
            {linkedTicketCode ? ` · ${linkedTicketCode}` : ""}
          </p>
        </div>
      </div>
      <Badge tone={pill.tone}>{pill.label}</Badge>
    </header>
  );
}
