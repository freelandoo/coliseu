import { expect, test, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";

let deviceId = "";
let personId = "";

const MARCA = "outbox-test";

/**
 * Fixture próprio, em vez de pescar um aluno do seed.
 *
 * Antes era `findFirst({ fase: "aluno" })` sem `orderBy`: o Postgres não garante
 * ordem, então cada rodada podia pegar um aluno diferente. Quando calhava de vir
 * um inativo ou sem pagamento, `evaluateAccessEligibility` decidia DISABLE e o
 * teste falhava — verde por sorte. Para liberar ENABLE a política exige
 * matrícula ACTIVE, pagamento PAID/PENDING em dia, credencial ENROLLED e
 * mapeamento IN_SYNC; tudo isso é montado aqui explicitamente.
 */
beforeAll(async () => {
  const unit = await prisma.unit.findFirstOrThrow();
  const plan = await prisma.plan.findFirstOrThrow();

  const device = await prisma.accessDevice.upsert({
    where: { unitId_name: { unitId: unit.id, name: "Catraca Test Outbox" } },
    update: {}, create: { unitId: unit.id, name: "Catraca Test Outbox" },
  });
  deviceId = device.id;

  const person = await prisma.person.create({
    data: {
      codigo: `${MARCA}-${Date.now()}`,
      nome: "Aluno Outbox Test",
      origem: "balcao",
      fase: "aluno",
      unitId: unit.id,
    },
  });
  personId = person.id;

  const daquiA = (dias: number) => new Date(Date.now() + dias * 86_400_000);

  await prisma.membership.create({
    data: {
      personId, planId: plan.id, status: "ACTIVE",
      vencimentoPlano: daquiA(30), ultimaPresenca: new Date(),
    },
  });

  // billingStatus vem do último Payment; sem ele a política cai no DENIED final.
  const customer = await prisma.billingCustomer.create({
    data: { asaasCustomerId: `cus_${MARCA}_${personId}`, personId },
  });
  const assinatura = await prisma.billingSubscription.create({
    data: { asaasSubscriptionId: `sub_${MARCA}_${personId}`, customerId: customer.id, value: plan.valorMensal },
  });
  await prisma.payment.create({
    data: {
      asaasPaymentId: `pay_${MARCA}_${personId}`, subscriptionId: assinatura.id,
      value: plan.valorMensal, dueDate: daquiA(10), status: "PAID", paidAt: new Date(),
    },
  });

  await prisma.accessCredential.create({
    data: { personId, type: "FACE", status: "ENROLLED", enrolledAt: new Date() },
  });
  await prisma.deviceUserMapping.upsert({
    where: { deviceId_personId: { deviceId, personId } },
    update: { syncStatus: "IN_SYNC" },
    // Fora da faixa do seed e da alocada em runtime (ACCESS_EXTERNAL_ID_FLOOR),
    // para não colidir no unique (deviceId, externalUserId).
    create: { deviceId, personId, externalUserId: "9000001", syncStatus: "IN_SYNC" },
  });
});

// A pessoa é só deste teste: apagar evita que outros testes a peguem por engano.
afterAll(async () => {
  await prisma.deviceCommand.deleteMany({ where: { personId } });
  await prisma.person.deleteMany({ where: { id: personId } });
});

test("recalcular acesso de aluno ativo enfileira ENABLE", async () => {
  await recalcularAcessoDePessoa(personId);
  const cmd = await prisma.deviceCommand.findFirst({ where: { deviceId, personId, type: "ENABLE" } });
  expect(cmd).not.toBeNull();
});

test("ALLOWED → DENIED → ALLOWED gera novo ENABLE (não é suprimido)", async () => {
  // person do beforeAll está ACTIVE/enrolled/in-sync. Simula flip via override para forçar DISABLE e voltar.
  // 1) ativo → ENABLE
  await recalcularAcessoDePessoa(personId);
  // 2) bloqueia (override BLOCK) → DISABLE
  const ov = await prisma.manualAccessOverride.create({ data: { personId, action: "BLOCK", reason: "t", expiresAt: new Date(Date.now() + 3600_000) } });
  await recalcularAcessoDePessoa(personId);
  // 3) remove bloqueio (expira o override) → ENABLE de novo
  await prisma.manualAccessOverride.update({ where: { id: ov.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await recalcularAcessoDePessoa(personId);
  const enables = await prisma.deviceCommand.count({ where: { deviceId, personId, type: "ENABLE" } });
  const disables = await prisma.deviceCommand.count({ where: { deviceId, personId, type: "DISABLE" } });
  expect(disables).toBeGreaterThanOrEqual(1);
  expect(enables).toBeGreaterThanOrEqual(1);
  // o 2º ENABLE não pode ter sido suprimido: deve haver um ENABLE criado APÓS o DISABLE
  const lastDisable = await prisma.deviceCommand.findFirst({ where: { deviceId, personId, type: "DISABLE" }, orderBy: { createdAt: "desc" } });
  const enableAfter = await prisma.deviceCommand.findFirst({ where: { deviceId, personId, type: "ENABLE", createdAt: { gt: lastDisable!.createdAt } } });
  expect(enableAfter).not.toBeNull();
});
