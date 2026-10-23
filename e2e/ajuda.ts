import { expect, type Page } from "@playwright/test";
import { CONTAS } from "./global-setup";

export type Conta = keyof typeof CONTAS;

/** Entra pela tela de login real e espera a tela inicial do papel. */
export async function entrar(page: Page, conta: Conta) {
  const { login, senha } = CONTAS[conta];
  await page.goto("/login");
  await page.getByLabel("Login ou e-mail").fill(login);
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** A tela montou: tem título e não caiu na tela de erro. */
export async function telaOk(page: Page) {
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(page.getByText("Esta tela não carregou")).toHaveCount(0);
}

/** Nada vaza para os lados (rolagem horizontal da página). */
export async function semRolagemLateral(page: Page) {
  const vaza = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(vaza).toBeLessThanOrEqual(1);
}
