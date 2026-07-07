import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { sincronizarCobrancaMembership } from "@/lib/billing/apply";

let unitId = "";
let planId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
});

async function pessoaComMembershipECobranca(codigo: string, status: "CANCELED" | "PENDING_PAYMENT", asaasId: string) {
  const p = await prisma.person.create({
    data: { codigo, nome: `Teste ${codigo}`, origem: "balcao", fase: "aluno", unitId },
  });
  const m = await prisma.membership.create({
    data: { personId: p.id, planId, status, vencimentoPlano: new Date("2026-12-01") },
  });
  await prisma.cobranca.create({
    data: { personId: p.id, tipo: "matricula", valor: 100, vencimento: new Date("2026-07-01"), status: "pendente", asaasId },
  });
  return { p, m };
}

test("pagamento NÃO ressuscita matrícula CANCELED", async () => {
  const { m } = await pessoaComMembershipECobranca("TAP01", "CANCELED", "pay_apply_1");
  await prisma.$transaction((tx) => sincronizarCobrancaMembership(tx, "pay_apply_1", "PAID"));
  const depois = await prisma.membership.findUniqueOrThrow({ where: { id: m.id } });
  expect(depois.status).toBe("CANCELED");
  // a cobrança em si é marcada como paga (contabilidade), sem reativar o contrato
  const cob = await prisma.cobranca.findFirstOrThrow({ where: { asaasId: "pay_apply_1" } });
  expect(cob.status).toBe("pago");
});

test("pagamento ativa matrícula PENDING_PAYMENT (fluxo normal)", async () => {
  const { m } = await pessoaComMembershipECobranca("TAP02", "PENDING_PAYMENT", "pay_apply_2");
  await prisma.$transaction((tx) => sincronizarCobrancaMembership(tx, "pay_apply_2", "PAID"));
  const depois = await prisma.membership.findUniqueOrThrow({ where: { id: m.id } });
  expect(depois.status).toBe("ACTIVE");
});

test("OVERDUE suspende só matrícula ACTIVE (não mexe em CANCELED)", async () => {
  const { m } = await pessoaComMembershipECobranca("TAP03", "CANCELED", "pay_apply_3");
  await prisma.$transaction((tx) => sincronizarCobrancaMembership(tx, "pay_apply_3", "OVERDUE"));
  expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("CANCELED");
});
