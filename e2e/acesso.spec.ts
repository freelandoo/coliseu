import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { entrar, telaOk } from "./ajuda";

// Etapa 7: a tela da catraca fala português (os códigos do agente ficam no
// banco) e as datas saem no fuso da academia — servidor e navegador pintam o
// mesmo texto, sem erro de hidratação.

const CODIGOS_CRUS =
  /\b(ONLINE|OFFLINE|ALLOWED|DENIED|DEAD_LETTER|UPSERT_USER|REMOVE_USER|PENDING|DISPATCHED|MAINTENANCE|INADIMPLENTE)\b/;

// O seed só tem a catraca: um acesso negado e um comando que desistiu entram
// aqui (com marca própria) para a tela ter o que traduzir, e saem no fim.
loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const MARCA = "e2e-acesso";

async function limpar() {
  await prisma.deviceCommand.deleteMany({ where: { dedupeKey: { startsWith: MARCA } } });
  await prisma.accessEvent.deleteMany({ where: { deviceEventId: { startsWith: MARCA } } });
}

test.beforeAll(async () => {
  await limpar();
  const device = await prisma.accessDevice.findFirstOrThrow();
  await prisma.deviceCommand.create({
    data: { deviceId: device.id, type: "UPSERT_USER", status: "DEAD_LETTER", dedupeKey: `${MARCA}-1` },
  });
  await prisma.accessEvent.create({
    data: {
      deviceId: device.id,
      unitId: device.unitId,
      deviceEventId: `${MARCA}-1`,
      deviceTime: new Date(),
      decision: "DENIED",
      reason: "INADIMPLENTE",
    },
  });
});

test.afterAll(async () => {
  await limpar();
  await prisma.$disconnect();
});

for (const rota of ["/acesso", "/perfil"]) {
  test(`${rota} sem código cru e sem erro de hidratação`, async ({ page }) => {
    const erros: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat/i.test(m.text())) erros.push(m.text());
    });
    await entrar(page, "admin");
    await page.goto(rota);
    await telaOk(page);
    await expect(page.locator("main")).not.toContainText(CODIGOS_CRUS);
    if (rota === "/acesso") {
      await expect(page.getByText("Desistiu (falhou várias vezes)")).toBeVisible();
      await expect(page.getByText(/Negado/).first()).toBeVisible();
    }
    expect(erros).toEqual([]);
  });
}

test("técnico abre o controle de acesso", async ({ page }) => {
  await entrar(page, "tecnico");
  await page.goto("/acesso");
  await telaOk(page);
  await expect(page.getByRole("heading", { level: 1, name: "Controle de acesso" })).toBeVisible();
});
