"use client";

import type { ConversationState } from "@nexo/domain";
import { Button } from "@/components/ui/button";

export interface TakeoverBarProps {
  state: ConversationState;
  employeeFirstName: string;
  assignedAnalystName: string | null;
  // O analista logado é o responsável pela conversa.
  mine: boolean;
  busy: boolean;
  error: string | null;
  onAssume: () => void;
  onReturn: () => void;
  onClose: () => void;
}

export function TakeoverBar({ state, employeeFirstName, assignedAnalystName, mine, busy, error, onAssume, onReturn, onClose }: TakeoverBarProps) {
  let title: string;
  let subtitle: string;
  if (state === "waiting_analyst") {
    title = `${employeeFirstName} espera um atendente`;
    subtitle = "Agent pausado";
  } else if (state === "analyst") {
    title = mine ? `Você está atendendo ${employeeFirstName}` : `Em atendimento com ${assignedAnalystName ?? "outro analista"}`;
    subtitle = "Agent pausado";
  } else if (state === "agent") {
    title = `O agent está atendendo ${employeeFirstName}`;
    subtitle = "Você acompanha a conversa e pode assumir o atendimento a qualquer momento";
  } else {
    title = "Conversa encerrada";
    subtitle = "Não é possível enviar mensagens";
  }
  const canReturn = state === "waiting_analyst" || (state === "analyst" && mine);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-6 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">
          {title}
          {state === "waiting_analyst" || state === "analyst" ? <span className="font-normal text-muted"> · {subtitle}</span> : null}
        </p>
        {state === "agent" || state === "closed" ? <p className="text-[13px] text-muted">{subtitle}</p> : null}
        {error ? (
          <p role="alert" className="mt-1 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        {canReturn ? (
          <Button variant="outline" disabled={busy} onClick={onReturn}>
            Devolver ao agent
          </Button>
        ) : null}
        {state === "waiting_analyst" || state === "agent" ? (
          <Button disabled={busy} onClick={onAssume}>
            Assumir atendimento
          </Button>
        ) : null}
        {state === "analyst" && mine ? (
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Encerrar conversa
          </Button>
        ) : null}
      </div>
    </div>
  );
}
