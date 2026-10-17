import { expect, test } from "vitest";
import { toPlano } from "@/lib/repositories/mappers";

test("toPlano mapeia row do Prisma para Plano de domínio", () => {
  const row = { id: "p1", nome: "Mensal", valorMensal: 129.9, duracaoDias: 30, ativo: true, descricao: null, unitId: "u1" };
  const plano = toPlano(row as never);
  expect(plano).toEqual({ id: "p1", nome: "Mensal", valorMensal: 129.9, duracaoDias: 30, ativo: true, descricao: undefined, mesclado: false });
});

import { toPessoa } from "@/lib/repositories/mappers";

const pessoaBase = {
  id: "x1", codigo: "CD00001", nome: "Ana", telefone: null, email: null, cpf: null, rg: null,
  vendedor: null, origem: "balcao", fase: "lead", criadoEm: new Date("2026-10-01T12:00:00Z"),
  estagio: "novo", motivoPerdido: null, dataNascimento: null,
  cep: null, estado: null, cidade: null, rua: null, numero: null, memberships: [],
};

test("toPessoa mantém endereço parcial (só rua, estado ou número)", () => {
  const soRua = toPessoa({ ...pessoaBase, rua: "Rua A", numero: "10" } as never);
  expect(soRua.endereco).toEqual({ cep: undefined, estado: undefined, cidade: undefined, rua: "Rua A", numero: "10" });
  const soEstado = toPessoa({ ...pessoaBase, estado: "SP" } as never);
  expect(soEstado.endereco?.estado).toBe("SP");
});

test("toPessoa sem nenhuma parte do endereço não inventa endereço", () => {
  expect(toPessoa(pessoaBase as never).endereco).toBeUndefined();
});
