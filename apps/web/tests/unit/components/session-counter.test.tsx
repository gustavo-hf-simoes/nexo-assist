// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Composer } from "@/components/chat/composer";
import { SessionCounter } from "@/components/chat/session-counter";

describe("SessionCounter", () => {
  it("mostra o uso da sessão", () => {
    render(<SessionCounter used={18} limit={30} />);
    expect(screen.getByText("18/30 mensagens nesta sessão")).toBeInTheDocument();
  });

  it("em 30/30 mostra a mensagem de limite", () => {
    render(<SessionCounter used={30} limit={30} />);
    expect(screen.getByRole("alert")).toHaveTextContent("limite de 30 mensagens");
  });
});

describe("Composer", () => {
  it("desabilitado mostra o motivo e bloqueia o envio", () => {
    render(<Composer value="" onChange={() => undefined} onSend={() => undefined} disabled disabledReason="Limite atingido." />);
    expect(screen.getByRole("textbox", { name: "Mensagem" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(screen.getByText("Limite atingido.")).toBeInTheDocument();
  });
});
