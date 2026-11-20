// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalystComposer } from "@/components/console/analyst-composer";
import { ConversationList } from "@/components/console/conversation-list";
import { EmployeeTicketsPanel } from "@/components/console/employee-tickets-panel";
import { TakeoverBar } from "@/components/console/takeover-bar";
import type { ConversationSummary } from "@/server/conversations/console-queries";

const noop = () => undefined;
const bar = { employeeFirstName: "Ana", assignedAnalystName: null, mine: false, busy: false, error: null, onAssume: noop, onReturn: noop, onClose: noop };

describe("TakeoverBar", () => {
  it("aguardando: oferece assumir e devolver", () => {
    const onAssume = vi.fn();
    render(<TakeoverBar {...bar} state="waiting_analyst" onAssume={onAssume} />);
    expect(screen.getByText(/Ana espera um atendente/)).toBeInTheDocument();
    expect(screen.getByText(/Agent pausado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devolver ao agent" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Assumir atendimento" }));
    expect(onAssume).toHaveBeenCalledOnce();
  });

  it("minha conversa: devolver e encerrar, sem assumir", () => {
    render(<TakeoverBar {...bar} state="analyst" mine />);
    expect(screen.queryByRole("button", { name: "Assumir atendimento" })).toBeNull();
    expect(screen.getByRole("button", { name: "Devolver ao agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Encerrar conversa" })).toBeInTheDocument();
  });

  it("com o agent: oferece assumir, sem devolver nem encerrar", () => {
    const onAssume = vi.fn();
    render(<TakeoverBar {...bar} state="agent" onAssume={onAssume} />);
    expect(screen.getByText(/O agent está atendendo Ana/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Devolver ao agent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Encerrar conversa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assumir atendimento" }));
    expect(onAssume).toHaveBeenCalledOnce();
  });

  it("conversa de outro analista e encerrada ficam só leitura", () => {
    const { rerender } = render(<TakeoverBar {...bar} state="analyst" assignedAnalystName="Júlia Castro" />);
    expect(screen.getByText(/Em atendimento com Júlia Castro/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<TakeoverBar {...bar} state="closed" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("mostra o erro da ação", () => {
    render(<TakeoverBar {...bar} state="waiting_analyst" error="Outro analista já assumiu." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Outro analista já assumiu.");
  });
});

describe("AnalystComposer", () => {
  it("desabilitado até assumir", () => {
    render(<AnalystComposer enabled={false} disabledReason="Assuma o atendimento para responder" onSend={async () => true} />);
    const box = screen.getByRole("textbox", { name: "Mensagem" });
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("placeholder", "Assuma o atendimento para responder");
  });

  it("envia e limpa o campo quando deu certo", async () => {
    const onSend = vi.fn(async () => true);
    render(<AnalystComposer enabled disabledReason="x" onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Mensagem" });
    fireEvent.change(box, { target: { value: "  Olá, Ana  " } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));
    await vi.waitFor(() => expect(box).toHaveValue(""));
    expect(onSend).toHaveBeenCalledWith("Olá, Ana");
  });

  it("mantém o texto quando o envio falha", async () => {
    const onSend = vi.fn(async () => false);
    render(<AnalystComposer enabled disabledReason="x" onSend={onSend} />);
    const box = screen.getByRole("textbox", { name: "Mensagem" });
    fireEvent.change(box, { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));
    await vi.waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(box).toHaveValue("Olá");
  });
});

const item: ConversationSummary = {
  id: "c1",
  employee: { id: "ana.souza", name: "Ana Souza", initials: "AS", department: "Financeiro" },
  state: "waiting_analyst",
  lastMessagePreview: "Meu notebook ficou lento",
  lastMessageAt: "2026-11-16T12:05:00.000Z",
  unreadForAnalyst: 2,
  badge: { tone: "danger", text: "Transferida · INC-20311" },
};
const list = { items: null, loading: false, error: false, selectedId: null, onSelect: noop, onRetry: noop, searching: false };

describe("ConversationList", () => {
  it("carregando, erro e vazio", () => {
    const { rerender } = render(<ConversationList {...list} loading />);
    expect(screen.getByText("Carregando conversas…")).toBeInTheDocument();
    rerender(<ConversationList {...list} error />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não consegui carregar as conversas.");
    rerender(<ConversationList {...list} items={[]} />);
    expect(screen.getByText("Nenhuma conversa neste filtro.")).toBeInTheDocument();
    rerender(<ConversationList {...list} items={[]} searching />);
    expect(screen.getByText("Nenhuma conversa encontrada para essa busca.")).toBeInTheDocument();
  });

  it("mostra nome, prévia, não lidas e badge, e seleciona ao clicar", () => {
    const onSelect = vi.fn();
    render(<ConversationList {...list} items={[item]} onSelect={onSelect} />);
    expect(screen.getByText("Transferida · INC-20311")).toBeInTheDocument();
    expect(screen.getByLabelText("2 não lidas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ana Souza/ }));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });
});

describe("EmployeeTicketsPanel", () => {
  it("mensagem pt-BR quando o serviço de chamados está fora", () => {
    render(<EmployeeTicketsPanel employeeFirstName="Ana" tickets={null} error="Não consegui carregar os chamados agora." linkedTicketCode={null} />);
    expect(screen.getByText("Chamados da Ana")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Não consegui carregar os chamados agora.");
  });

  it("chamado da conversa mostra a prioridade com acento", () => {
    const ticket = {
      code: "INC-20311",
      type: "INC" as const,
      category: "Hardware" as const,
      priority: "media" as const,
      status: "aguardando_analista" as const,
      title: "Notebook lento após atualização do Windows",
      description: "Lento desde a atualização.",
      affected: "individual" as const,
      requesterId: "ana.souza",
      createdAt: "2026-11-15T13:00:00.000Z",
      updatedAt: "2026-11-15T13:00:00.000Z",
      lastSupportUpdateAt: null,
      resolvedAt: null,
    };
    render(<EmployeeTicketsPanel employeeFirstName="Ana" tickets={[ticket]} error={null} linkedTicketCode="INC-20311" />);
    expect(screen.getByText("Hardware · prioridade média")).toBeInTheDocument();
  });
});
