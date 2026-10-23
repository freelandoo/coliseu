import { expect, test } from "@playwright/test";
import { entrar, telaOk } from "./ajuda";

// Etapa 2: as telas de Alunos leem só a fase de que precisam. Estes fluxos
// garantem que o recorte no banco não tirou ninguém de onde devia aparecer.

test("lista de alunos mostra alunos e nenhum lead", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/matriculados");
  await telaOk(page);
  // A lista tem a versão de celular e a de desktop no DOM; vale a visível.
  await expect(page.getByText("Pedro Henrique").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Marcos Vieira").filter({ visible: true })).toBeVisible(); // cancelado também é aluno
  await expect(page.getByText("Marina Alves")).toHaveCount(0); // lead
});

test("ficha do aluno abre a partir da lista", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/matriculados");
  await page.getByLabel("Buscar alunos").fill("Juliana");
  await page.getByRole("link", { name: /Juliana Castro/ }).first().click();
  await expect(page).toHaveURL(/\/matriculados\/[^/]+/);
  await telaOk(page);
  await expect(page.getByText("Juliana Castro").first()).toBeVisible();
});

test("renovação lista leads em aberto, alunos a renovar e pendentes de pagamento", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/matriculados/renovar");
  await telaOk(page);
  const busca = page.getByLabel("1 · Escolher pessoa");
  await busca.fill("Marina");
  await expect(page.getByRole("button", { name: /Marina Alves/ })).toBeVisible(); // lead novo
  await busca.fill("Aline");
  await expect(page.getByRole("button", { name: /Aline Cardoso/ })).toBeVisible(); // venceu há 12 dias
  await busca.fill("Pedro");
  await expect(page.getByRole("button", { name: /Pedro Henrique/ })).toHaveCount(0); // anual em dia
  const aguardando = page.getByRole("heading", { name: "Aguardando pagamento" }).locator("..");
  await expect(aguardando.getByText("Anderson Pinto")).toBeVisible();
});
