"use client";

import type { TicketDto } from "@nexo/domain";
import { Avatar } from "@/components/ui/avatar";
import { ActionChips } from "./action-chips";
import { chipsFromParts, chipsFromTrace, findTool, isRecord, partsOf, textOf, type RawPart } from "./chat-parts";
import type { ChatMessage, DraftView } from "./chat-types";
import { DraftCard } from "./draft-card";
import { QuickReplies } from "./quick-replies";
import { TicketCard } from "./ticket-card";
import { TicketChoiceList, type ChoiceOption } from "./ticket-choice-list";

export interface DraftUi {
  busyId: string | null;
  errors: Record<string, string>;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
  onEdit: (draft: DraftView) => void;
}

export interface AgentMessageProps {
  message: ChatMessage;
  // Estado atual dos rascunhos no servidor, por id (sobrepõe o que veio na parte da mensagem).
  drafts: Record<string, DraftView>;
  draftUi: DraftUi;
  // A mensagem é a última da conversa: só nela as escolhas e o atalho Ctrl+Enter valem.
  active: boolean;
  onChoose: (text: string) => void;
  now?: Date;
}

function choicesOf(parts: readonly RawPart[]): { question: string; kind: string; options: ChoiceOption[] } | null {
  const part = parts.find((p) => p.type === "tool-present_choices" && isRecord(p["input"]));
  const input = part?.["input"];
  if (!isRecord(input) || !Array.isArray(input["options"])) return null;
  const options = (input["options"] as unknown[]).filter(isRecord).flatMap((o) =>
    typeof o["label"] === "string" && typeof o["value"] === "string" ? [{ label: o["label"], value: o["value"] }] : [],
  );
  if (options.length === 0 || typeof input["question"] !== "string") return null;
  return { question: input["question"], kind: String(input["kind"]), options };
}

function ticketsFromSearch(parts: readonly RawPart[]): TicketDto[] {
  const output = findTool(parts, "search_my_tickets")?.["output"];
  return isRecord(output) && Array.isArray(output["tickets"]) ? (output["tickets"] as TicketDto[]) : [];
}

export function AgentMessage({ message, drafts, draftUi, active, onChoose, now }: AgentMessageProps) {
  const parts = partsOf(message);
  const isAnalyst = message.metadata?.author === "analyst";
  const name = isAnalyst ? (message.metadata?.authorName ?? "Analista") : "Nexo Assist";
  const text = textOf(message);
  const trace = message.metadata?.trace;
  const chips = trace ? chipsFromTrace(trace.tools) : chipsFromParts(parts);

  const ticketOutput = findTool(parts, "get_ticket")?.["output"];
  const ticketCard =
    isRecord(ticketOutput) && ticketOutput["ok"] === true && isRecord(ticketOutput["ticket"])
      ? {
          ticket: ticketOutput["ticket"] as unknown as TicketDto,
          dueAt: typeof ticketOutput["dueAt"] === "string" ? ticketOutput["dueAt"] : undefined,
          overdue: ticketOutput["overdue"] === true,
          slaLabel: typeof ticketOutput["slaLabel"] === "string" ? ticketOutput["slaLabel"] : undefined,
        }
      : null;

  const draftOutput = findTool(parts, "prepare_ticket_draft")?.["output"];
  const draftFromPart =
    isRecord(draftOutput) && draftOutput["ok"] === true && isRecord(draftOutput["draft"]) ? (draftOutput["draft"] as unknown as DraftView) : null;
  const draft = draftFromPart ? (drafts[draftFromPart.id] ?? draftFromPart) : null;

  const choices = choicesOf(parts);
  const tickets = choices?.kind === "ticket_choice" ? ticketsFromSearch(parts) : [];
  const ticketOptions: ChoiceOption[] =
    choices?.kind === "ticket_choice"
      ? choices.options.map((o) => ({ ...o, ticket: tickets.find((t) => t.code === o.value) }))
      : [];

  return (
    <div className="flex items-start gap-3">
      {isAnalyst ? <Avatar name={name} size={28} /> : null}
      <div className="flex min-w-0 max-w-[88%] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-ink">{name}</span>
          {!isAnalyst ? <ActionChips tools={chips} trace={trace} /> : null}
        </div>
        {text ? (
          <p className="whitespace-pre-wrap rounded-[4px_12px_12px_12px] border border-line bg-white px-4 py-2.5 text-[14.5px] leading-[22px] text-ink">
            {text}
          </p>
        ) : null}
        {ticketCard ? <TicketCard {...ticketCard} /> : null}
        {draft ? (
          <DraftCard
            draft={draft}
            busy={draftUi.busyId === draft.id}
            error={draftUi.errors[draft.id]}
            shortcutActive={active}
            {...(now ? { now } : {})}
            onConfirm={draftUi.onConfirm}
            onCancel={draftUi.onCancel}
            onEdit={draftUi.onEdit}
          />
        ) : null}
        {choices && choices.kind === "ticket_choice" ? (
          <TicketChoiceList question={choices.question} options={ticketOptions} disabled={!active} onChoose={onChoose} />
        ) : null}
        {choices && choices.kind === "quick_reply" ? (
          <QuickReplies question={choices.question} options={choices.options} disabled={!active} onChoose={onChoose} />
        ) : null}
      </div>
    </div>
  );
}
