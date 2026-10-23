import { expect, test } from "@playwright/test";
import { entrar, telaOk } from "./ajuda";

// Etapa 6: Cobrança lê só o que está em aberto e o nome leva à ficha;
// Despesas pede confirmação antes de excluir um lançamento.

test("cobrança: atrasadas em aberto e o nome abre a ficha", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/cobranca");
  await telaOk(page);
  const atrasadas = page.getByRole("button", { name: /^Atrasadas/ });
  await atrasadas.click();
  await expect(atrasadas).toHaveAttribute("aria-pressed", "true");

  const linhas = page.locator("tbody tr");
  await expect(linhas.first()).toContainText("Atrasado");
  await linhas.first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/matriculados\/[^/]+$/);
  await telaOk(page);
});

test("despesas: lançar e excluir com confirmação", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/custos");
  await telaOk(page);

  await page.getByRole("button", { name: "+ Manutenção" }).click();
  await page.getByLabel("Valor (R$)").fill("321,45");
  await page.getByLabel("Descrição (opcional)").fill("E2E esteira");
  await page.getByRole("button", { name: "Lançar despesa" }).click();
  const linha = page.locator("tbody tr").filter({ hasText: "E2E esteira" });
  await expect(linha).toBeVisible();

  // Cancelar não apaga nada.
  await linha.getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("heading", { name: "Excluir despesa" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(linha).toBeVisible();

  await linha.getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "E2E esteira" })).toHaveCount(0);
});
