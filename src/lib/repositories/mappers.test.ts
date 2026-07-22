import { expect, test } from "vitest";
import { toPlano } from "@/lib/repositories/mappers";

test("toPlano mapeia row do Prisma para Plano de domínio", () => {
  const row = { id: "p1", nome: "Mensal", valorMensal: 129.9, duracaoDias: 30, ativo: true, descricao: null, unitId: "u1" };
  const plano = toPlano(row as never);
  expect(plano).toEqual({ id: "p1", nome: "Mensal", valorMensal: 129.9, duracaoDias: 30, ativo: true, descricao: undefined });
});
