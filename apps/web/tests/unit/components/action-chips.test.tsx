// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ActionChips } from "@/components/chat/action-chips";
import { chipsFromTrace } from "@/components/chat/chat-parts";
import { TRACE } from "./fixtures";

describe("ActionChips", () => {
  it("mostra um chip por ação e abre o detalhe da decisão", async () => {
    render(<ActionChips tools={chipsFromTrace(TRACE.tools)} trace={TRACE} />);
    expect(screen.getByText("consultou seus chamados")).toBeInTheDocument();
    expect(screen.getByText("buscou na central de ajuda")).toBeInTheDocument();
    expect(screen.queryByText("Entendimento")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ver detalhes" }));

    expect(screen.getByText("Entendimento")).toBeInTheDocument();
    expect(screen.getByText(TRACE.understanding)).toBeInTheDocument();
    expect(screen.getByText("Ação")).toBeInTheDocument();
    expect(screen.getByText(TRACE.action)).toBeInTheDocument();
    expect(screen.getByText("Confiança")).toBeInTheDocument();
    expect(screen.getByText("41%")).toBeInTheDocument();
    expect(screen.getByText("Motivo")).toBeInTheDocument();
    expect(screen.getByText(TRACE.rationale)).toBeInTheDocument();
    // Cada tool com entrada e resultado resumidos.
    expect(screen.getByText(/"query":"vpn erro 809"/)).toBeInTheDocument();
    expect(screen.getByText(/vpn-erro-809/)).toBeInTheDocument();
  });

  it("sem trace não mostra o botão de detalhes", () => {
    render(<ActionChips tools={chipsFromTrace(TRACE.tools)} />);
    expect(screen.queryByRole("button", { name: "Ver detalhes" })).not.toBeInTheDocument();
  });
});
