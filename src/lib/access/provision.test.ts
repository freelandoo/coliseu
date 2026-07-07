import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { provisionarAcessoDePessoa } from "@/lib/access/provision";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { matricularPessoaRepo } from "@/lib/repositories/pessoas";

let unitId = "";
let planId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
});

async function novoAluno(codigo: string) {
  return prisma.person.create({
    data: { codigo, nome: `Aluno ${codigo}`, origem: "balcao", fase: "aluno", unitId },
  });
}

test("aluno novo: cria mapping com externalUserId novo e enfileira UPSERT_USER desabilitado", async () => {
  const p = await novoAluno("TPRO1");
  const r = await provisionarAcessoDePessoa(p.id);
  expect(r.mappingsCriados).toBeGreaterThanOrEqual(1);

  const mapping = await prisma.deviceUserMapping.findFirstOrThrow({ where: { personId: p.id } });
  expect(mapping.syncStatus).toBe("PENDING");
  // id numérico novo, acima da faixa do seed (1001-1003)
  expect(Number(mapping.externalUserId)).toBeGreaterThan(1003);

  const cmd = await prisma.deviceCommand.findFirstOrThrow({
    where: { personId: p.id, type: "UPSERT_USER" },
  });
  const payload = cmd.payload as { externalUserId?: string; nome?: string; enabled?: boolean };
  expect(payload.externalUserId).toBe(mapping.externalUserId);
  expect(payload.nome).toBe(p.nome);
  // provisionar NÃO habilita: quem habilita é o ENABLE emitido pela política
  expect(payload.enabled).toBe(false);
});

test("idempotente: segunda chamada não duplica mapping nem comando", async () => {
  const p = await novoAluno("TPRO2");
  await provisionarAcessoDePessoa(p.id);
  await provisionarAcessoDePessoa(p.id);
  expect(await prisma.deviceUserMapping.count({ where: { personId: p.id } }))
    .toBe(await prisma.accessDevice.count({ where: { unitId } }));
  const device = await prisma.accessDevice.findFirstOrThrow({ where: { unitId } });
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, deviceId: device.id, type: "UPSERT_USER", status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBe(1);
});

test("alocação sequencial: dois alunos novos recebem ids diferentes", async () => {
  const a = await novoAluno("TPRO3");
  const b = await novoAluno("TPRO4");
  await provisionarAcessoDePessoa(a.id);
  await provisionarAcessoDePessoa(b.id);
  const ma = await prisma.deviceUserMapping.findFirstOrThrow({ where: { personId: a.id } });
  const mb = await prisma.deviceUserMapping.findFirstOrThrow({ where: { personId: b.id } });
  expect(ma.externalUserId).not.toBe(mb.externalUserId);
});

test("não-aluno (lead) não é provisionado", async () => {
  const p = await prisma.person.create({
    data: { codigo: "TPRO5", nome: "Lead TPRO5", origem: "balcao", fase: "lead", estagio: "novo", unitId },
  });
  const r = await provisionarAcessoDePessoa(p.id);
  expect(r.mappingsCriados).toBe(0);
  expect(await prisma.deviceUserMapping.count({ where: { personId: p.id } })).toBe(0);
});

test("recalcularAcessoDePessoa auto-provisiona aluno sem mapping (base existente)", async () => {
  const p = await novoAluno("TPRO6");
  await prisma.membership.create({
    data: { personId: p.id, planId, status: "ACTIVE", vencimentoPlano: new Date("2027-01-01") },
  });
  await recalcularAcessoDePessoa(p.id);
  expect(await prisma.deviceUserMapping.count({ where: { personId: p.id } })).toBeGreaterThanOrEqual(1);
  expect(await prisma.deviceCommand.count({ where: { personId: p.id, type: "UPSERT_USER" } })).toBeGreaterThanOrEqual(1);
});

test("matricularPessoaRepo provisiona o aluno na catraca", async () => {
  const lead = await prisma.person.create({
    data: { codigo: "TPRO7", nome: "Lead TPRO7", origem: "balcao", fase: "lead", estagio: "novo", unitId },
  });
  await matricularPessoaRepo(lead.id, planId);
  expect(await prisma.deviceUserMapping.count({ where: { personId: lead.id } })).toBeGreaterThanOrEqual(1);
  expect(await prisma.deviceCommand.count({ where: { personId: lead.id, type: "UPSERT_USER" } })).toBeGreaterThanOrEqual(1);
});
