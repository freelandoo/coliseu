import { expect, test } from "vitest";
import { listarPessoasRepo, criarPessoaRepo, proximoCodigoRepo } from "@/lib/repositories/pessoas";

test("listarPessoasRepo devolve pessoas seedadas", async () => {
  const pessoas = await listarPessoasRepo();
  expect(pessoas.length).toBeGreaterThanOrEqual(14);
});

test("listarPessoasRepo deixa de fora os ex-alunos do histórico", async () => {
  const { prisma } = await import("@/lib/db");
  const { unitIdAtual } = await import("@/lib/repositories/unit");
  const ex = await prisma.person.create({
    data: { codigo: await proximoCodigoRepo(), nome: "Ex Aluno Histórico", origem: "balcao", fase: "exaluno", unitId: await unitIdAtual() },
  });
  try {
    const pessoas = await listarPessoasRepo();
    expect(pessoas.some((p) => p.id === ex.id)).toBe(false);
  } finally {
    await prisma.person.delete({ where: { id: ex.id } });
  }
});

test("proximoCodigoRepo gera código sequencial CD…", async () => {
  const cod = await proximoCodigoRepo();
  expect(cod).toMatch(/^CD\d{5}$/);
});

test("criarPessoaRepo cria lead com código novo", async () => {
  const p = await criarPessoaRepo({ nome: "Teste Repo", origem: "balcao", telefone: "(11) 90000-0000" });
  expect(p.fase).toBe("lead");
  expect(p.codigo).toMatch(/^CD\d{5}$/);
});
