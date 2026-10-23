import { expect, test } from "@playwright/test";
import { entrar, semRolagemLateral, telaOk } from "./ajuda";

const TELAS = [
  "/painel",
  "/atendimento",
  "/matriculados",
  "/matriculados/renovar",
  "/captacao",
  "/aula-experimental",
  "/cobranca",
  "/custos",
  "/relatorios",
  "/acesso",
  "/perfil",
];

test("no celular nenhuma tela vaza para os lados", async ({ page }) => {
  await entrar(page, "admin");
  for (const rota of TELAS) {
    await page.goto(rota);
    await telaOk(page);
    await semRolagemLateral(page);
  }
});

test("no celular o menu abre como gaveta e navega", async ({ page }) => {
  await entrar(page, "admin");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("navigation", { name: "Módulos" }).getByRole("link", { name: "Alunos" }).click();
  await expect(page).toHaveURL(/\/matriculados$/);
});
