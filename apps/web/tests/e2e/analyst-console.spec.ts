import { expect, test } from "@playwright/test";

const EMAIL = "rafael.lima@nexo.com.br";

test("analista vê a Ana em Para você, assume, responde e devolve ao agent", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill("qualquer-senha");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/console/);

  const main = page.getByRole("main");
  await page.getByRole("tab", { name: /Para você/ }).click();
  const row = page.getByRole("button", { name: /Ana Souza/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Transferida · INC-20311");
  await row.click();

  await expect(main.getByText("Aguardando atendente")).toBeVisible();
  await expect(main.getByText("Resumo da transferência")).toBeVisible();
  await expect(main.getByText(/notebook lento após a atualização do Windows/)).toBeVisible();
  await main.getByRole("button", { name: "Por que transferiu" }).click();
  await expect(main.getByText(/get_ticket|consultou seus chamados/).first()).toBeVisible();
  await expect(main.getByText(/Ana espera um atendente/)).toBeVisible();
  await expect(main.getByText("Chamados da Ana")).toBeVisible();
  await expect(main.getByText("Desta conversa")).toBeVisible();
  await expect(main.getByRole("textbox", { name: "Mensagem" })).toBeDisabled();

  await main.getByRole("button", { name: "Assumir atendimento" }).click();
  const box = main.getByRole("textbox", { name: "Mensagem" });
  await expect(box).toBeEnabled();
  await box.fill("Oi, Ana. Já estou vendo o seu chamado.");
  await main.getByRole("button", { name: /Enviar/ }).click();
  await expect(main.getByText("Oi, Ana. Já estou vendo o seu chamado.")).toBeVisible();

  await main.getByRole("button", { name: "Devolver ao agent" }).click();
  await expect(main.getByText(/O agent está atendendo Ana/)).toBeVisible();
  await expect(main.getByRole("textbox", { name: "Mensagem" })).toBeDisabled();
});
