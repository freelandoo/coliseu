import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { entrar, telaOk } from "./ajuda";

// Etapa 4: a Captação desenha os leads em lotes e lê só as aulas de hoje. A
// base de produção tem mais de mil leads; aqui entram 120 de teste (com código
// próprio, apagados no fim) para o lote ter o que cortar.

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const PREFIXO = "E2E-LEAD-";
const QUANTOS = 120;

test.beforeAll(async () => {
  await prisma.person.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
  const unit = await prisma.unit.findFirstOrThrow();
  const agora = Date.now();
  await prisma.person.createMany({
    data: Array.from({ length: QUANTOS }, (_, i) => ({
      unitId: unit.id,
      codigo: `${PREFIXO}${String(i).padStart(3, "0")}`,
      nome: `Lote Teste ${String(i).padStart(3, "0")}`,
      telefone: `(11) 97000-${String(i).padStart(4, "0")}`,
      origem: "balcao" as const,
      fase: "lead" as const,
      estagio: "novo" as const,
      // O 000 é o mais novo: primeiro da lista.
      criadoEm: new Date(agora - i * 60_000),
    })),
  });
});

test.afterAll(async () => {
  await prisma.person.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
  await prisma.$disconnect();
});

const linhas = (page: import("@playwright/test").Page) => page.locator("tbody tr");

test("lista desenha 50 por vez e a busca olha todos", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/captacao");
  await telaOk(page);
  await expect(linhas(page)).toHaveCount(50);
  await expect(linhas(page).first()).toContainText("Lote Teste 000");

  await page.getByRole("button", { name: "Mostrar mais 50" }).click();
  await expect(linhas(page)).toHaveCount(100);

  // A busca acha quem está fora do lote desenhado — e o 119 do nome não vira
  // busca por telefone (casaria com todo celular "(11) 9…").
  await page.getByLabel("Buscar leads por nome ou telefone").fill("Lote Teste 119");
  await expect(linhas(page)).toHaveCount(1);
  await expect(page.getByText(/^1 de \d+ leads$/)).toBeVisible();

  // Limpar volta ao primeiro lote.
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(linhas(page)).toHaveCount(50);
});

test("estágio conta a base inteira, não só o lote", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/captacao");
  const novo = page.getByRole("group", { name: "Estágio" }).getByRole("button", { name: /Lead novo/ });
  const total = Number(await novo.locator("span").last().textContent());
  expect(total).toBeGreaterThanOrEqual(QUANTOS);
});
