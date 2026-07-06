import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";

let deviceId = "";
let personId = "";

beforeAll(async () => {
  const unit = await prisma.unit.findFirstOrThrow();
  const device = await prisma.accessDevice.upsert({
    where: { unitId_name: { unitId: unit.id, name: "Catraca Test Outbox" } },
    update: {}, create: { unitId: unit.id, name: "Catraca Test Outbox" },
  });
  deviceId = device.id;
  const p = await prisma.person.findFirstOrThrow({ where: { fase: "aluno" } });
  personId = p.id;
  // credencial enrolled + mapping in-sync para permitir ALLOW
  await prisma.accessCredential.create({ data: { personId, type: "FACE", status: "ENROLLED", enrolledAt: new Date() } });
  await prisma.deviceUserMapping.upsert({
    where: { deviceId_personId: { deviceId, personId } },
    update: { syncStatus: "IN_SYNC" },
    create: { deviceId, personId, externalUserId: "1001", syncStatus: "IN_SYNC" },
  });
});

test("recalcular acesso de aluno ativo enfileira ENABLE", async () => {
  await recalcularAcessoDePessoa(personId);
  const cmd = await prisma.deviceCommand.findFirst({ where: { deviceId, type: "ENABLE" } });
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
