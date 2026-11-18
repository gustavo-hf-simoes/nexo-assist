// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentMessage, type DraftUi } from "@/components/chat/agent-message";
import type { ChatMessage, DraftView } from "@/components/chat/chat-types";
import { QuickReplies } from "@/components/chat/quick-replies";
import { TicketCard } from "@/components/chat/ticket-card";
import { TicketChoiceList } from "@/components/chat/ticket-choice-list";
import { DRAFT, NOW } from "./fixtures";

const TICKET = {
  code: "INC-20101",
  type: "INC" as const,
  category: "Rede e VPN" as const,
  priority: "alta" as const,
  status: "aberto" as const,
  title: "VPN cai toda hora",
  description: "A conexão cai a cada dez minutos.",
  affected: "individual" as const,
  requesterId: "ana.souza",
  createdAt: "2026-11-17T13:00:00.000Z",
  updatedAt: "2026-11-17T13:00:00.000Z",
  lastSupportUpdateAt: null,
  resolvedAt: null,
};

function toolPart(name: string, input: unknown, output: unknown): ChatMessage["parts"][number] {
  return { type: `tool-${name}`, toolCallId: `call-${name}`, state: "output-available", input, output } as ChatMessage["parts"][number];
}

function agent(parts: ChatMessage["parts"]): ChatMessage {
  return { id: "m1", role: "assistant", parts, metadata: { author: "agent" } };
}

function draftUi(overrides: Partial<DraftUi> = {}): DraftUi {
  return { busyId: null, errors: {}, onConfirm: vi.fn(), onCancel: vi.fn(), onEdit: vi.fn(), ...overrides };
}

function renderMessage(
  message: ChatMessage,
  opts: { drafts?: Record<string, DraftView>; ui?: DraftUi; active?: boolean; onChoose?: (text: string) => void } = {},
) {
  return render(
    <AgentMessage
      message={message}
      drafts={opts.drafts ?? {}}
      draftUi={opts.ui ?? draftUi()}
      active={opts.active ?? true}
      onChoose={opts.onChoose ?? vi.fn()}
      now={NOW}
    />,
  );
}

describe("AgentMessage: mapeamento de partes", () => {
  it("tool-get_ticket vira TicketCard com prazo e SLA", () => {
    renderMessage(
      agent([
        toolPart("get_ticket", { code: TICKET.code }, { ok: true, ticket: TICKET, dueAt: "2026-11-18T18:00:00.000Z", overdue: true, slaLabel: "4 h úteis" }),
        { type: "text", text: "Aqui está o chamado." },
      ]),
    );
    expect(screen.getByRole("heading", { name: "VPN cai toda hora" })).toBeInTheDocument();
    expect(screen.getByText("Chamado · INC-20101")).toBeInTheDocument();
    expect(screen.getByText(/prazo vencido/)).toBeInTheDocument();
    expect(screen.getByText("4 h úteis")).toBeInTheDocument();
    expect(screen.getByText("Aqui está o chamado.")).toBeInTheDocument();
  });

  it("get_ticket com ok=false não desenha card", () => {
    renderMessage(agent([toolPart("get_ticket", { code: "INC-1" }, { ok: false }), { type: "text", text: "Não encontrei esse chamado." }]));
    expect(screen.queryByText(/Chamado ·/)).not.toBeInTheDocument();
    expect(screen.getByText("Não encontrei esse chamado.")).toBeInTheDocument();
  });

  it("present_choices ticket_choice lista os chamados e a escolha devolve o rótulo", async () => {
    const onChoose = vi.fn();
    renderMessage(
      agent([
        toolPart("search_my_tickets", { scope: "open" }, { ok: true, tickets: [TICKET] }),
        toolPart("present_choices", { kind: "ticket_choice", question: "Qual chamado?", options: [{ label: "INC-20101", value: "INC-20101" }] }, { ok: true }),
      ]),
      { onChoose },
    );
    expect(screen.getByText("VPN cai toda hora")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /INC-20101/ }));
    expect(onChoose).toHaveBeenCalledWith("INC-20101");
  });

  it("present_choices quick_reply vira botões e a escolha devolve o rótulo", async () => {
    const onChoose = vi.fn();
    renderMessage(
      agent([
        toolPart(
          "present_choices",
          { kind: "quick_reply", question: "Funcionou?", options: [{ label: "Sim, resolveu", value: "yes" }, { label: "Não", value: "no" }] },
          { ok: true },
        ),
      ]),
      { onChoose },
    );
    expect(screen.getByText("Funcionou?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sim, resolveu" }));
    expect(onChoose).toHaveBeenCalledWith("Sim, resolveu");
  });

  it("escolhas ficam desabilitadas quando a mensagem não é a última", () => {
    renderMessage(
      agent([toolPart("present_choices", { kind: "quick_reply", question: "Funcionou?", options: [{ label: "Sim", value: "yes" }] }, { ok: true })]),
      { active: false },
    );
    expect(screen.getByRole("button", { name: "Sim" })).toBeDisabled();
  });

  it("prepare_ticket_draft vira DraftCard e Confirmar chama onConfirm com o id", async () => {
    const ui = draftUi();
    renderMessage(agent([toolPart("prepare_ticket_draft", {}, { ok: true, draft: DRAFT })]), { ui });
    expect(screen.getByText("Aguardando confirmação")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(ui.onConfirm).toHaveBeenCalledWith("d1");
  });

  it("o status do servidor sobrepõe o da parte e esconde os botões", () => {
    renderMessage(agent([toolPart("prepare_ticket_draft", {}, { ok: true, draft: DRAFT })]), {
      drafts: { d1: { ...DRAFT, status: "superseded" } },
    });
    expect(screen.getByText("Substituído")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).not.toBeInTheDocument();
  });

  it("mostra o erro do rascunho vindo de draftUi.errors", () => {
    renderMessage(agent([toolPart("prepare_ticket_draft", {}, { ok: true, draft: DRAFT })]), {
      ui: draftUi({ errors: { d1: "O serviço de chamados está indisponível no momento." } }),
    });
    expect(screen.getByText("O serviço de chamados está indisponível no momento.")).toBeInTheDocument();
  });
});

describe("componentes de escolha e card isolados", () => {
  it("TicketCard sem prazo mostra travessão", () => {
    render(<TicketCard ticket={TICKET} />);
    expect(screen.getByText("Prazo").nextSibling).toHaveTextContent("—");
  });

  it("TicketChoiceList sem ticket mostra o rótulo e dispara onChoose", async () => {
    const onChoose = vi.fn();
    render(<TicketChoiceList question="Qual?" options={[{ label: "Nenhum deles", value: "none" }]} onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: "Nenhum deles" }));
    expect(onChoose).toHaveBeenCalledWith("Nenhum deles");
  });

  it("QuickReplies desabilitado não dispara", async () => {
    const onChoose = vi.fn();
    render(<QuickReplies question="Ok?" options={[{ label: "Sim", value: "y" }]} disabled onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: "Sim" }));
    expect(onChoose).not.toHaveBeenCalled();
  });
});
