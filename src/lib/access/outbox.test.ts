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
