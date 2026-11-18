import { expect, test } from "@playwright/test";

// Diego não tem conversa pendente com analista no seed (a da Ana está em waiting_analyst).
const EMAIL = "diego.ramos@nexo.com.br";
const CREATED = /Chamado INC-\d+ criado/;

test("funcionário descreve o problema, confirma o rascunho e o histórico sobrevive ao reload", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill("qualquer-senha");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/atendimento/);
  await expect(page.getByText("Assistente online")).toBeVisible();

  // Escopo no main visível: o navegador pode manter a tela de login oculta no DOM.
  const chat = page.getByRole("main");
  // O histórico chega por fetch: só conta depois que a conversa carregou.
  await expect(chat.getByText("Carregando a conversa…")).toHaveCount(0);
  await expect(chat.getByText(/\/30 mensagens nesta sessão/)).toBeVisible();
  const createdBefore = await chat.getByText(CREATED).count();

  await page.getByRole("textbox", { name: "Mensagem" }).fill("Meu notebook não conecta na VPN, erro 809");
  await page.getByRole("button", { name: "Enviar" }).click();

  await expect(chat.getByText("consultou seus chamados").last()).toBeVisible();
  await expect(chat.getByText("buscou na central de ajuda").last()).toBeVisible();
  const draftTitle = chat.getByText("VPN não conecta no notebook — erro 809").last();
  await expect(draftTitle).toBeVisible();
  await expect(chat.getByText("Rede e VPN").last()).toBeVisible();

  await chat.getByRole("button", { name: /Confirmar/ }).click();
  await expect(chat.getByText(CREATED)).toHaveCount(createdBefore + 1);

  await page.reload();
  const reloaded = page.getByRole("main");
  await expect(reloaded.getByText("Meu notebook não conecta na VPN, erro 809").last()).toBeVisible();
  await expect(reloaded.getByText(CREATED)).toHaveCount(createdBefore + 1);
});
