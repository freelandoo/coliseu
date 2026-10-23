import { expect, test } from "@playwright/test";
import { entrar, semRolagemLateral, telaOk } from "./ajuda";

// Etapa 5: gráficos próprios em SVG, um eixo por gráfico, tabela ao lado e
// tooltip que também abre pelo teclado.

test("gráficos do tempo: tooltip pelo teclado e tabela com os mesmos meses", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/relatorios");
  await telaOk(page);
  await semRolagemLateral(page);

  const recebido = page.getByRole("group", { name: /Recebido por mês/ });
  await recebido.focus();
  await page.keyboard.press("ArrowRight");
  await expect(recebido.getByRole("status")).toContainText("recebido");

  const cartao = page.getByRole("heading", { name: "Recebido por mês" }).locator("xpath=ancestor::section[1]");
  await cartao.getByText("Ver em tabela").click();
  await expect(cartao.getByRole("table").locator("tbody tr")).toHaveCount(6);
});

test("matrículas por mês tem as duas séries no tooltip", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/relatorios");
  const grafico = page.getByRole("group", { name: /Matrículas por mês/ });
  await grafico.focus();
  await page.keyboard.press("ArrowLeft");
  const dica = grafico.getByRole("status");
  await expect(dica).toContainText("novas");
  await expect(dica).toContainText("vencidas sem renovar");
});
