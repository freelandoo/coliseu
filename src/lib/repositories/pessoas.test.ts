import { expect, test } from "vitest";
import { listarPessoasRepo, criarPessoaRepo, proximoCodigoRepo } from "@/lib/repositories/pessoas";

test("listarPessoasRepo devolve pessoas seedadas", async () => {
  const pessoas = await listarPessoasRepo();
  expect(pessoas.length).toBeGreaterThanOrEqual(14);
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
