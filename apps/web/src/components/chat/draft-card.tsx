"use client";

import { PRIORITY_LABEL } from "@nexo/domain";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { formatDue } from "@/lib/format";
import type { DraftView } from "./chat-types";

export interface DraftCardProps {
  draft: DraftView;
  busy?: boolean;
  error?: string | undefined;
  shortcutActive?: boolean;
  now?: Date;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (draft: DraftView) => void;
}

const STATE: Record<DraftView["status"], { label: string; tone: StatusTone }> = {
  pending: { label: "Aguardando confirmação", tone: "warn" },
  confirming: { label: "Confirmando…", tone: "warn" },
  confirmed: { label: "Confirmado", tone: "ok" },
  cancelled: { label: "Cancelado", tone: "muted" },
  superseded: { label: "Substituído", tone: "muted" },
  failed: { label: "Não foi possível confirmar", tone: "danger" },
};

const KIND_LABEL: Record<DraftView["kind"], string> = {
  create: "Novo chamado",
  update: "Atualização de chamado",
  reopen: "Reabertura de chamado",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

export function DraftCard({ draft, busy = false, error, shortcutActive = false, now, onConfirm, onCancel, onEdit }: DraftCardProps) {
  const actionable = draft.status === "pending" || draft.status === "confirming";
  const confirmBusy = busy || draft.status === "confirming";
  const canConfirm = draft.status === "pending" && !confirmBusy;

  useEffect(() => {
    if (!shortcutActive || !canConfirm) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onConfirm(draft.id);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shortcutActive, canConfirm, draft.id, onConfirm]);

  const state = STATE[draft.status];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {KIND_LABEL[draft.kind]}
          {draft.targetCode ? ` ${draft.targetCode}` : ""} · Rascunho {draft.displayCode}
        </p>
        <StatusDot tone={state.tone} label={state.label} />
      </div>
      <div className="px-5 pb-4 pt-2">
        <h3 className="text-[18px] font-semibold leading-[23px] text-ink">{draft.title}</h3>
        <p className="mt-1.5 text-[13.5px] leading-5 text-ink-soft">{draft.description}</p>
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-3">
          <Field label="Categoria">{draft.category}</Field>
          <Field label="Prioridade">
            <span className="font-semibold">{PRIORITY_LABEL[draft.priority]}</span>
            <span className="text-ink-soft"> · resposta até {formatDue(draft.dueAt, now)}</span>
          </Field>
          <Field label="Afetados">{draft.affectedLabel}</Field>
        </dl>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {actionable ? (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">
          <Button disabled={!canConfirm} onClick={() => onConfirm(draft.id)}>
            {confirmBusy ? "Confirmando…" : "Confirmar"}
            {!confirmBusy ? <kbd className="rounded bg-white/20 px-1.5 text-[11px] font-medium">⌘↵</kbd> : null}
          </Button>
          <Button variant="outline" disabled={confirmBusy} onClick={() => onEdit(draft)}>
            Editar
          </Button>
          <Button variant="ghost" disabled={confirmBusy} onClick={() => onCancel(draft.id)}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
