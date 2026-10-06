import { beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { MesclaInvalida, mesclarPlanosRepo } from "@/lib/repositories/planos";

let unitId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
});

async function plano(nome: string, valorMensal: number) {
  return prisma.plan.create({ data: { nome, valorMensal, duracaoDias: 30, unitId } });
}
async function alunoNo(planId: string, codigo: string) {
  const p = await prisma.person.create({ data: { codigo, nome: `Aluno ${codigo}`, origem: "balcao", fase: "aluno", unitId } });
  await prisma.membership.create({ data: { personId: p.id, planId, status: "ACTIVE", vencimentoPlano: new Date("2027-01-01") } });
  await prisma.historicoPlano.create({ data: { personId: p.id, ordem: 0, nomePlano: "legado", planId } });
  return p;
}

test("mescla move alunos e histórico para o destino e arquiva os demais", async () => {
  const a = await plano("Mensal Velho A", 99);
  const b = await plano("Mensal Velho B", 109);
  const c = await plano("Mensal Promo C", 89);
  await alunoNo(a.id, "TPM01");
  await alunoNo(b.id, "TPM02");
  await alunoNo(b.id, "TPM03");
  await alunoNo(c.id, "TPM04");

  const r = await mesclarPlanosRepo({
    planoIds: [a.id, b.id, c.id], destinoId: b.id, nome: "Mensal", valorMensal: 119.9, duracaoDias: 30,
  });
  expect(r.matriculasMovidas).toBe(2);
  expect(r.plano.nome).toBe("Mensal");
  expect(r.plano.valorMensal).toBe(119.9);

  expect(await prisma.membership.count({ where: { planId: b.id } })).toBe(4);
  expect(await prisma.membership.count({ where: { planId: { in: [a.id, c.id] } } })).toBe(0);
  expect(await prisma.historicoPlano.count({ where: { planId: b.id } })).toBe(4);
  for (const id of [a.id, c.id]) {
    const p = await prisma.plan.findUniqueOrThrow({ where: { id } });
    expect(p.ativo).toBe(false);
    expect(p.mescladoEmId).toBe(b.id);
    expect(p.descricao).toContain("Mensal");
  }
});

test("mescla em cadeia: plano já mesclado num de origem segue para o novo destino", async () => {
  const x = await plano("Cadeia X", 50);
  const y = await plano("Cadeia Y", 60);
  const z = await plano("Cadeia Z", 70);
  await mesclarPlanosRepo({ planoIds: [x.id, y.id], destinoId: y.id, nome: "XY", valorMensal: 60, duracaoDias: 30 });
  await mesclarPlanosRepo({ planoIds: [y.id, z.id], destinoId: z.id, nome: "XYZ", valorMensal: 70, duracaoDias: 30 });
  expect((await prisma.plan.findUniqueOrThrow({ where: { id: x.id } })).mescladoEmId).toBe(z.id);
  expect((await prisma.plan.findUniqueOrThrow({ where: { id: y.id } })).mescladoEmId).toBe(z.id);
});

test("validações: menos de 2 planos, destino fora da seleção, plano já mesclado, valor inválido", async () => {
  const a = await plano("Val A", 10);
  const b = await plano("Val B", 20);
  const base = { nome: "N", valorMensal: 10, duracaoDias: 30 };
  await expect(mesclarPlanosRepo({ ...base, planoIds: [a.id], destinoId: a.id })).rejects.toBeInstanceOf(MesclaInvalida);
  await expect(mesclarPlanosRepo({ ...base, planoIds: [a.id, b.id], destinoId: "outro" })).rejects.toThrow(/destino/);
  await expect(mesclarPlanosRepo({ ...base, valorMensal: 0, planoIds: [a.id, b.id], destinoId: a.id })).rejects.toThrow(/Valor/);
  await mesclarPlanosRepo({ ...base, planoIds: [a.id, b.id], destinoId: a.id });
  const c = await plano("Val C", 30);
  await expect(mesclarPlanosRepo({ ...base, planoIds: [b.id, c.id], destinoId: c.id })).rejects.toThrow(/já foi mesclado/);
});
