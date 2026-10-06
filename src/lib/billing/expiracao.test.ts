import { afterEach, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { candidatosExpiracao, expirarMatriculasVencidas } from "@/lib/billing/expiracao";

let unitId = "";
let planId = "";
const AGORA = new Date("2026-10-06T12:00:00Z");
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
});

afterEach(() => {
  delete process.env.EXPIRACAO_MATRICULAS;
});

async function aluno(codigo: string, vencidoHaDias: number, assinatura?: string) {
  const p = await prisma.person.create({
    data: { codigo, nome: `Teste ${codigo}`, origem: "balcao", fase: "aluno", unitId },
  });
  const m = await prisma.membership.create({
    data: { personId: p.id, planId, status: "ACTIVE", vencimentoPlano: dias(vencidoHaDias), matriculadoEm: dias(400) },
  });
  if (assinatura) {
    const bc = await prisma.billingCustomer.create({ data: { asaasCustomerId: `cus_${codigo}`, personId: p.id } });
    await prisma.billingSubscription.create({ data: { asaasSubscriptionId: assinatura, customerId: bc.id, value: 100 } });
  }
  return { p, m };
}

test("candidatos: passou da carência, sem assinatura real ativa, só a matrícula mais recente", async () => {
  const vencido = await aluno("TEXP01", 10);
  const naCarencia = await aluno("TEXP02", 3);
  const comAssinaturaReal = await aluno("TEXP03", 10, "sub_texp03real");
  const comAssinaturaMock = await aluno("TEXP04", 10, "sub_mock_texp04");
  const renovou = await aluno("TEXP05", 30);
  await prisma.membership.create({
    data: { personId: renovou.p.id, planId, status: "ACTIVE", vencimentoPlano: dias(-20), matriculadoEm: dias(10) },
  });

  const ids = new Set((await candidatosExpiracao(AGORA)).map((c) => c.personId));
  expect(ids.has(vencido.p.id)).toBe(true);
  expect(ids.has(comAssinaturaMock.p.id)).toBe(true);
  expect(ids.has(naCarencia.p.id)).toBe(false);
  expect(ids.has(comAssinaturaReal.p.id)).toBe(false);
  expect(ids.has(renovou.p.id)).toBe(false);
});

test("modo simulação (padrão) não vence ninguém", async () => {
  const { m } = await aluno("TEXP06", 10);
  const r = await expirarMatriculasVencidas({ agora: AGORA });
  expect(r.modo).toBe("simular");
  expect(r.candidatos).toBeGreaterThan(0);
  expect(r.expiradas).toBe(0);
  expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("ACTIVE");
});

test("modo ativo vence, e rodar de novo não repete", async () => {
  process.env.EXPIRACAO_MATRICULAS = "ativa";
  const { m } = await aluno("TEXP07", 10);
  const r1 = await expirarMatriculasVencidas({ agora: AGORA });
  expect(r1.expiradas).toBeGreaterThan(0);
  expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("EXPIRED");
  const r2 = await expirarMatriculasVencidas({ agora: AGORA });
  expect(r2.expiradas).toBe(0);
});

test("botão do admin (forcar) vence mesmo em simulação", async () => {
  const { m } = await aluno("TEXP08", 10);
  await expirarMatriculasVencidas({ agora: AGORA, forcar: true });
  expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("EXPIRED");
});
