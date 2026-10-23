import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { entrar, telaOk } from "./ajuda";

// Etapa 3: o Atendimento foi quebrado em partes (lista, busca, histórico, caixa
// de resposta). Estes fluxos garantem que a tela continua fazendo o mesmo. O
// seed não tem WhatsApp: as conversas nascem aqui, numa instância própria, e
// somem no fim (as mensagens vão junto por cascade). Nada é enviado.

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
const INSTANCIA = "e2e-atendimento";

test.beforeAll(async () => {
  await prisma.whatsappInstance.deleteMany({ where: { evolutionInstance: INSTANCIA } });
  const unit = await prisma.unit.findFirstOrThrow();
  const marina = await prisma.person.findFirst({ where: { nome: "Marina Alves" } });
  const instancia = await prisma.whatsappInstance.create({
    data: { unitId: unit.id, evolutionInstance: INSTANCIA, nome: "E2E", status: "CONNECTED" },
  });
  const agora = Date.now();
  const em = (minutos: number) => new Date(agora - minutos * 60_000);
  const conversa = (dados: {
    jid: string;
    nome: string;
    minutos: number;
    interesse?: "nao_classificado" | "com_interesse";
    grupo?: boolean;
    personId?: string;
    mensagens: { dir: "IN" | "OUT"; texto: string; minutos: number }[];
  }) =>
    prisma.conversa.create({
      data: {
        unitId: unit.id,
        instanceId: instancia.id,
        remoteJid: dados.jid,
        telefone: dados.grupo ? "" : dados.jid.split("@")[0],
        pushName: dados.nome,
        ehGrupo: !!dados.grupo,
        personId: dados.personId,
        interesse: dados.interesse ?? "nao_classificado",
        naoLidas: 1,
        ultimaMensagemEm: em(dados.minutos),
        ultimaMensagemPreview: dados.mensagens[dados.mensagens.length - 1].texto,
        mensagens: {
          create: dados.mensagens.map((m, i) => ({
            waMessageId: `${INSTANCIA}-${dados.jid}-${i}`,
            direcao: m.dir,
            autor: m.dir === "IN" ? "LEAD" : "ATENDENTE",
            texto: m.texto,
            enviadaEm: em(m.minutos),
          })),
        },
      },
    });

  await conversa({
    jid: "5511990000001@s.whatsapp.net",
    nome: "Marina Alves",
    minutos: 5,
    personId: marina?.id,
    mensagens: [
      { dir: "IN", texto: "Oi, queria saber dos planos", minutos: 30 },
      { dir: "OUT", texto: "Olá! Temos mensal, trimestral e anual.", minutos: 20 },
      { dir: "IN", texto: "Tem musculação noturna depois das 22h?", minutos: 5 },
    ],
  });
  await conversa({
    jid: "5511990000002@s.whatsapp.net",
    nome: "E2E Rafael Moura",
    minutos: 10,
    interesse: "com_interesse",
    mensagens: [{ dir: "IN", texto: "Posso fazer uma aula experimental?", minutos: 10 }],
  });
  await conversa({
    jid: "120363000000000001@g.us",
    nome: "E2E Grupo Treino",
    minutos: 2,
    grupo: true,
    mensagens: [{ dir: "IN", texto: "Bom dia, pessoal", minutos: 2 }],
  });
});

test.afterAll(async () => {
  await prisma.whatsappInstance.deleteMany({ where: { evolutionInstance: INSTANCIA } });
  await prisma.$disconnect();
});

const lista = (page: Page) => page.getByRole("list", { name: "Conversas" });

test("lista separa pessoas de grupos e abre o histórico", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/atendimento");
  await telaOk(page);
  await expect(lista(page).getByText("Marina Alves")).toBeVisible();
  await expect(lista(page).getByText("E2E Grupo Treino")).toHaveCount(0);

  await lista(page).getByRole("button", { name: /Marina Alves/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Marina Alves" })).toBeVisible();
  await expect(page.getByText("Olá! Temos mensal, trimestral e anual.")).toBeVisible();
  await expect(page.getByText("Início da conversa")).toBeVisible();

  await page.getByRole("button", { name: /^Grupos/ }).click();
  await expect(lista(page).getByText("E2E Grupo Treino")).toBeVisible();
  await expect(lista(page).getByText("Marina Alves")).toHaveCount(0);
});

test("citar, rascunho e cancelar citação", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/atendimento");
  await lista(page).getByRole("button", { name: /Marina Alves/ }).click();

  const bolha = page.locator("[id^=msg-]").filter({ hasText: "Tem musculação noturna depois das 22h?" });
  await bolha.hover();
  await bolha.getByRole("button", { name: "Citar esta mensagem" }).click();
  await expect(page.getByText("Respondendo a Marina Alves")).toBeVisible();

  const caixa = page.getByLabel("Resposta para Marina Alves");
  await caixa.fill("Temos sim, até meia-noite");
  await caixa.press("Escape");
  await expect(page.getByText("Respondendo a Marina Alves")).toHaveCount(0);

  // Trocar de conversa guarda o rascunho e a lista avisa.
  await lista(page).getByRole("button", { name: /E2E Rafael Moura/ }).click();
  await expect(lista(page).getByRole("button", { name: /Marina Alves/ })).toContainText("Rascunho");
  await lista(page).getByRole("button", { name: /Marina Alves/ }).click();
  await expect(page.getByLabel("Resposta para Marina Alves")).toHaveValue("Temos sim, até meia-noite");
});

test("busca acha palavra do histórico e bandeira filtra o estágio", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/atendimento");
  const busca = page.getByLabel("Buscar conversa por nome, telefone ou palavra do histórico");
  await busca.fill("noturna");
  await expect(lista(page).getByRole("button", { name: /Marina Alves/ })).toContainText("noturna");
  await expect(lista(page).getByText("E2E Rafael Moura")).toHaveCount(0);
  await busca.fill("");

  await page.getByRole("button", { name: /^Filtrar por Com interesse/ }).click();
  await expect(lista(page).getByText("E2E Rafael Moura")).toBeVisible();
  await expect(lista(page).getByText("Marina Alves")).toHaveCount(0);
  await page.getByRole("button", { name: "Todas" }).click();
  await expect(lista(page).getByText("Marina Alves")).toBeVisible();
});

test("ficha ao lado e confirmação de limpar (admin)", async ({ page }) => {
  await entrar(page, "admin");
  await page.goto("/atendimento");
  await lista(page).getByRole("button", { name: /Marina Alves/ }).click();
  await page.getByRole("button", { name: "Ficha" }).click();
  await expect(page.getByRole("dialog").or(page.getByRole("complementary", { name: /Ficha de/ }))).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Limpar" }).click();
  await expect(page.getByRole("heading", { name: "Limpar conversa" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("Olá! Temos mensal, trimestral e anual.")).toBeVisible();
});

test("recepção responde mas não apaga", async ({ page }) => {
  await entrar(page, "recepcao");
  await page.goto("/atendimento");
  await lista(page).getByRole("button", { name: /E2E Rafael Moura/ }).click();
  await expect(page.getByLabel("Resposta para E2E Rafael Moura")).toBeVisible();
  await expect(page.getByRole("button", { name: "Limpar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remover" })).toHaveCount(0);
});
