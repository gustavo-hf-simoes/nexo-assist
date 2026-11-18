// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DraftCard } from "@/components/chat/draft-card";
import { DRAFT, NOW } from "./fixtures";

const noop = () => undefined;

describe("DraftCard", () => {
  it("em pending mostra os campos e as três ações", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onEdit = vi.fn();
    render(<DraftCard draft={DRAFT} now={NOW} onConfirm={onConfirm} onCancel={onCancel} onEdit={onEdit} />);

    expect(screen.getByText(DRAFT.title)).toBeInTheDocument();
    expect(screen.getByText(DRAFT.description)).toBeInTheDocument();
    expect(screen.getByText("Categoria")).toBeInTheDocument();
    expect(screen.getByText("Rede e VPN")).toBeInTheDocument();
    expect(screen.getByText("Prioridade")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    expect(screen.getByText(/resposta até 13:43/)).toBeInTheDocument();
    expect(screen.getByText("Afetados")).toBeInTheDocument();
    expect(screen.getByText("Somente você")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Confirmar/ }));
    expect(onConfirm).toHaveBeenCalledWith("d1");
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalledWith(DRAFT);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledWith("d1");
  });

  it("desabilita o Confirmar enquanto a requisição corre", () => {
    render(<DraftCard draft={DRAFT} now={NOW} busy onConfirm={noop} onCancel={noop} onEdit={noop} />);
    expect(screen.getByRole("button", { name: /Confirmar|Confirmando/ })).toBeDisabled();
  });

  it("Ctrl+Enter confirma quando o atalho está ativo", async () => {
    const onConfirm = vi.fn();
    render(<DraftCard draft={DRAFT} now={NOW} shortcutActive onConfirm={onConfirm} onCancel={noop} onEdit={noop} />);
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onConfirm).toHaveBeenCalledWith("d1");
  });

  it("rascunho confirmado ou cancelado não tem botões de ação", () => {
    const { rerender } = render(<DraftCard draft={{ ...DRAFT, status: "confirmed" }} now={NOW} onConfirm={noop} onCancel={noop} onEdit={noop} />);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    rerender(<DraftCard draft={{ ...DRAFT, status: "cancelled" }} now={NOW} onConfirm={noop} onCancel={noop} onEdit={noop} />);
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmar/ })).not.toBeInTheDocument();
  });
});
