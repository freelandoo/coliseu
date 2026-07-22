import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  atualizarColaboradorRepo,
  criarColaboradorRepo,
  ColaboradorErro,
  normalizarLogin,
  sugerirLoginRepo,
} from "@/lib/repositories/colaboradores";

const PREFIXO = "teste-colab";

async function limpar() {
  await prisma.session.deleteMany({ where: { user: { login: { startsWith: PREFIXO } } } });
  await prisma.user.deleteMany({ where: { login: { startsWith: PREFIXO } } });
}

beforeEach(limpar);
afterAll(limpar);

const novo = (login: string, role: "ADMIN" | "RECEPCAO" | "TECNICO" = "RECEPCAO") =>
  criarColaboradorRepo({ nome: `Fulano ${login}`, login, senha: "senha12345", role });

describe("normalizarLogin", () => {
  test("nome vira login digitável", () => {
    expect(normalizarLogin("Maria Silva")).toBe("maria.silva");
    expect(normalizarLogin("  João   Pedro ")).toBe("joao.pedro");
  });

  test("descarta o que não é aceito na URL/credencial", () => {
    expect(normalizarLogin("Ana@Costa!")).toBe("ana.costa");
    expect(normalizarLogin("...bruno...")).toBe("bruno");
    expect(normalizarLogin("!!!")).toBe("");
  });
});

test("sugerirLogin desvia de login já usado", async () => {
  await novo(`${PREFIXO}.claudia`);
  const sugestao = await sugerirLoginRepo(`${PREFIXO} claudia`);
  expect(sugestao).not.toBe(`${PREFIXO}.claudia`);
  expect(sugestao.startsWith(`${PREFIXO}.claudia`)).toBe(true);
});

test("colaborador nasce com senha provisória e ativo", async () => {
  const c = await novo(`${PREFIXO}.ana`);
  expect(c).toMatchObject({ senhaProvisoria: true, ativo: true, role: "RECEPCAO" });
  // A senha nunca volta em claro, só o hash fica no banco.
  expect(JSON.stringify(c)).not.toContain("senha12345");
});

test("login duplicado é recusado", async () => {
  await novo(`${PREFIXO}.dup`);
  await expect(novo(`${PREFIXO}.dup`)).rejects.toBeInstanceOf(ColaboradorErro);
});

test("senha curta é recusada", async () => {
  await expect(
    criarColaboradorRepo({ nome: "Curta", login: `${PREFIXO}.curta`, senha: "123", role: "RECEPCAO" }),
  ).rejects.toThrow(/8 caracteres/);
});

test("promover a administrador funciona", async () => {
  const c = await novo(`${PREFIXO}.promove`);
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", ativo: true } });

  const r = await atualizarColaboradorRepo(c.id, { role: "ADMIN" }, admin.id);
  expect(r.role).toBe("ADMIN");
});

test("ninguém remove o próprio acesso de administrador", async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", ativo: true } });
  await novo(`${PREFIXO}.outro`, "ADMIN"); // garante que não é o último

  await expect(
    atualizarColaboradorRepo(admin.id, { role: "RECEPCAO" }, admin.id),
  ).rejects.toThrow(/próprio acesso/);
  await expect(
    atualizarColaboradorRepo(admin.id, { ativo: false }, admin.id),
  ).rejects.toThrow(/próprio acesso/);
});

test("o último administrador ativo não pode ser rebaixado nem desativado", async () => {
  // Deixa exatamente um ADMIN ativo: o criado aqui.
  const unico = await novo(`${PREFIXO}.unico`, "ADMIN");
  const outrosAdmins = await prisma.user.findMany({
    where: { role: "ADMIN", ativo: true, id: { not: unico.id } },
    select: { id: true },
  });
  await prisma.user.updateMany({
    where: { id: { in: outrosAdmins.map((o) => o.id) } },
    data: { ativo: false },
  });

  // Ator diferente do alvo, para isolar da regra de "não mexer em si mesmo".
  const ator = await novo(`${PREFIXO}.ator`);

  await expect(
    atualizarColaboradorRepo(unico.id, { role: "RECEPCAO" }, ator.id),
  ).rejects.toThrow(/último administrador/);

  await prisma.user.updateMany({
    where: { id: { in: outrosAdmins.map((o) => o.id) } },
    data: { ativo: true },
  });
});

test("desativar derruba as sessões abertas", async () => {
  const c = await novo(`${PREFIXO}.sessao`);
  await prisma.session.create({
    data: { userId: c.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", ativo: true } });

  await atualizarColaboradorRepo(c.id, { ativo: false }, admin.id);

  expect(await prisma.session.count({ where: { userId: c.id } })).toBe(0);
});

test("redefinir senha volta a marcar como provisória e derruba sessões", async () => {
  const c = await novo(`${PREFIXO}.reset`);
  await prisma.user.update({ where: { id: c.id }, data: { senhaProvisoria: false } });
  await prisma.session.create({
    data: { userId: c.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", ativo: true } });

  const r = await atualizarColaboradorRepo(c.id, { senha: "outrasenha123" }, admin.id);

  expect(r.senhaProvisoria).toBe(true);
  expect(await prisma.session.count({ where: { userId: c.id } })).toBe(0);
});
