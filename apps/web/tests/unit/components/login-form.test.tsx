// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Activity } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/login-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("LoginForm", () => {
  // Com cacheComponents, o Next guarda a tela de login escondida (Activity) e a reexibe ao sair.
  it("volta pronto para um novo login quando a tela é reexibida depois de entrar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ redirectTo: "/atendimento" })),
    );
    const { rerender } = render(
      <Activity mode="visible">
        <LoginForm />
      </Activity>,
    );
    await userEvent.type(screen.getByLabelText("E-mail corporativo"), "ana.souza@nexo.com.br");
    await userEvent.type(screen.getByLabelText("Senha"), "segredo");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(push).toHaveBeenCalledWith("/atendimento");

    rerender(
      <Activity mode="hidden">
        <LoginForm />
      </Activity>,
    );
    rerender(
      <Activity mode="visible">
        <LoginForm />
      </Activity>,
    );

    const submit = screen.getByRole("button", { name: "Entrar" });
    expect(submit).toBeEnabled();
    expect(screen.getByLabelText("Senha")).toHaveValue("");
  });
});
