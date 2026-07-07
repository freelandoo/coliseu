import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { iniciarCadastroFace } from "@/lib/access/enroll";
import { ackComando } from "@/lib/agent/ingest";
import { matricularPessoaRepo } from "@/lib/repositories/pessoas";

let unitId = "";
let planId = "";
let deviceId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
  deviceId = (await prisma.accessDevice.findFirstOrThrow({ where: { unitId } })).id;
});

async function novoAlunoMatriculado(codigo: string) {
  const lead = await prisma.person.create({
    data: { codigo, nome: `Aluno ${codigo}`, origem: "balcao", fase: "lead", estagio: "novo", unitId },
  });
  await matricularPessoaRepo(lead.id, planId);
  return lead;
}

test("inicia cadastro: credencial FACE IN_PROGRESS + comando ENROLL com o externalUserId do mapping", async () => {
  const p = await novoAlunoMatriculado("TENR1");
  const r = await iniciarCadastroFace({ personId: p.id, deviceId });
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: p.id, type: "FACE" } });
  expect(cred.status).toBe("IN_PROGRESS");

  const mapping = await prisma.deviceUserMapping.findUniqueOrThrow({
    where: { deviceId_personId: { deviceId, personId: p.id } },
  });
  const payload = r.comando.payload as { externalUserId?: string; type?: string };
  expect(r.comando.type).toBe("ENROLL");
  expect(payload.externalUserId).toBe(mapping.externalUserId);
  expect(payload.type).toBe("FACE");
});

test("idempotente: segunda chamada reusa o ENROLL pendente (não duplica)", async () => {
  const p = await novoAlunoMatriculado("TENR2");
  await iniciarCadastroFace({ personId: p.id, deviceId });
  await iniciarCadastroFace({ personId: p.id, deviceId });
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, deviceId, type: "ENROLL", status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBe(1);
});

test("ack SUCCEEDED do ENROLL: credencial ENROLLED e política emite ENABLE de quem está em dia", async () => {
  const p = await novoAlunoMatriculado("TENR3");
  // aluno em dia: ACTIVE + fatura emitida não vencida + mapping já sincronizado
  await prisma.membership.updateMany({ where: { personId: p.id }, data: { status: "ACTIVE" } });
  const bc = await prisma.billingCustomer.create({ data: { asaasCustomerId: `cus_${p.id}`, personId: p.id } });
  const bs = await prisma.billingSubscription.create({ data: { asaasSubscriptionId: `sub_${p.id}`, customerId: bc.id, value: 100 } });
  await prisma.payment.create({
    data: { asaasPaymentId: `pay_${p.id}`, subscriptionId: bs.id, value: 100, dueDate: new Date(Date.now() + 7 * 86_400_000), status: "PENDING", statusUpdatedAt: new Date() },
  });
  await prisma.deviceUserMapping.updateMany({ where: { personId: p.id }, data: { syncStatus: "IN_SYNC" } });

  const r = await iniciarCadastroFace({ personId: p.id, deviceId });
  if (!r.ok) throw new Error(r.erro);
  await ackComando({ commandId: r.comando.id, status: "SUCCEEDED" });

  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: p.id, type: "FACE" } });
  expect(cred.status).toBe("ENROLLED");
  expect(cred.enrolledAt).not.toBeNull();
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, type: "ENABLE", status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBeGreaterThanOrEqual(1);
});

test("ack FAILED do ENROLL: credencial IN_PROGRESS vira FAILED", async () => {
  const p = await novoAlunoMatriculado("TENR4");
  const r = await iniciarCadastroFace({ personId: p.id, deviceId });
  if (!r.ok) throw new Error(r.erro);
  await ackComando({ commandId: r.comando.id, status: "FAILED", error: "captura cancelada" });

  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: p.id, type: "FACE" } });
  expect(cred.status).toBe("FAILED");
});

test("recadastro: credencial já ENROLLED não regride ao pedir nova captura", async () => {
  const p = await novoAlunoMatriculado("TENR5");
  const r1 = await iniciarCadastroFace({ personId: p.id, deviceId });
  if (!r1.ok) throw new Error(r1.erro);
  await ackComando({ commandId: r1.comando.id, status: "SUCCEEDED" });

  const r2 = await iniciarCadastroFace({ personId: p.id, deviceId });
  expect(r2.ok).toBe(true);
  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: p.id, type: "FACE" } });
  expect(cred.status).toBe("ENROLLED"); // se a nova captura falhar, o acesso atual permanece
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, deviceId, type: "ENROLL", status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBe(1);
});

test("valida entrada: lead não cadastra face; catraca desconhecida é recusada", async () => {
  const lead = await prisma.person.create({
    data: { codigo: "TENR6", nome: "Lead TENR6", origem: "balcao", fase: "lead", estagio: "novo", unitId },
  });
  const r1 = await iniciarCadastroFace({ personId: lead.id, deviceId });
  expect(r1.ok).toBe(false);

  const p = await novoAlunoMatriculado("TENR7");
  const r2 = await iniciarCadastroFace({ personId: p.id, deviceId: "device-inexistente" });
  expect(r2.ok).toBe(false);
});
