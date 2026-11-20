// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentMessage } from "@/components/chat/agent-message";
import { PausedBanner } from "@/components/chat/paused-banner";
import { analystMessage } from "./fixtures";

const noop = () => undefined;

describe("PausedBanner", () => {
  it("aguardando analista", () => {
    render(<PausedBanner state="waiting_analyst" />);
    expect(screen.getByText("Um analista vai falar com você")).toBeInTheDocument();
  });

  it("analista atendendo", () => {
    render(<PausedBanner state="analyst" />);
    expect(screen.getByText("Analista atendendo")).toBeInTheDocument();
  });

  it("mostra o motivo em português e diz que o analista lê as mensagens", () => {
    render(<PausedBanner state="analyst" reason="overdue" />);
    expect(screen.getByRole("status")).toHaveTextContent("Motivo: prazo vencido");
    expect(screen.getByRole("status")).not.toHaveTextContent("overdue");
    expect(screen.getByRole("status")).toHaveTextContent("O analista lê o que você escrever aqui");
  });

  it("não aparece com o agent", () => {
    const { container } = render(<PausedBanner state="agent" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("mensagens do analista", () => {
  it("mostram o nome dele", () => {
    render(
      <AgentMessage
        message={analystMessage()}
        drafts={{}}
        draftUi={{ busyId: null, errors: {}, onConfirm: noop, onCancel: noop, onEdit: noop }}
        active={false}
        onChoose={noop}
      />,
    );
    expect(screen.getByText("Rafael Lima")).toBeInTheDocument();
    expect(screen.getByText("Oi Ana, já estou olhando o seu chamado.")).toBeInTheDocument();
  });
});
