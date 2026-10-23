import { expect, test } from "@playwright/test";
import { entrar, telaOk } from "./ajuda";

const TELAS_ADMIN = [
  "/painel",
  "/atendimento",
  "/matriculados",
  "/matriculados/renovar",
  "/matriculados/retencao",
  "/matriculados/fidelidade",
  "/matriculados/fidelidade/indicadores",
  "/captacao",
  "/aula-experimental",
  "/cobranca",
  "/custos",
  "/relatorios",
  "/acesso",
  "/perfil",
];

test("login não oferece cadastro quando já existe usuário", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByText("Não tem conta? Cadastrar")).toHaveCount(0);
});

test("admin abre todas as telas do menu sem erro", async ({ page }) => {
  await entrar(page, "admin");
  await expect(page).toHaveURL(/\/painel$/);
  for (const rota of TELAS_ADMIN) {
    await page.goto(rota);
    await telaOk(page);
  }
});

test("menu: o dia a dia vem primeiro e cada item leva à sua tela", async ({ page }) => {
  await entrar(page, "admin");
  const menu = page.getByRole("navigation", { name: "Módulos" });
  await expect(menu.getByText("Dia a dia")).toBeVisible();
  await menu.getByRole("link", { name: "Alunos" }).click();
  await expect(page).toHaveURL(/\/matriculados$/);
  await expect(page.getByRole("heading", { level: 1, name: "Alunos" })).toBeVisible();
});

test("técnico só vê a catraca: telas e API de alunos ficam fechadas", async ({ page }) => {
  await entrar(page, "tecnico");
  await expect(page).toHaveURL(/\/acesso$/);
  for (const rota of ["/matriculados", "/matriculados/renovar", "/captacao", "/painel", "/cobranca"]) {
    await page.goto(rota);
    await expect(page).toHaveURL(/\/acesso$/);
  }
  const r = await page.request.get("/api/pessoas");
  expect(r.status()).toBe(403);
});

test("recepção trabalha no balcão, mas não abre o financeiro", async ({ page }) => {
  await entrar(page, "recepcao");
  await expect(page).toHaveURL(/\/atendimento$/);
  await page.goto("/matriculados");
  await telaOk(page);
  for (const rota of ["/cobranca", "/relatorios", "/custos", "/painel"]) {
    await page.goto(rota);
    await expect(page).toHaveURL(/\/atendimento$/);
  }
});

test("endereço inexistente mostra a página 404 com caminho de volta", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/nao-existe-mesmo");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page).toHaveURL(/\/painel$/);
});
