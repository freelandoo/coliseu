import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { criarComando, listarDevices, overridesAtivosDe } from "@/lib/repositories/access";

beforeAll(async () => {
  const unit = await prisma.unit.findFirstOrThrow();
  await prisma.accessDevice.upsert({
    where: { unitId_name: { unitId: unit.id, name: "Catraca Principal" } },
    update: {},
    create: { unitId: unit.id, name: "Catraca Principal", mode: "HYBRID", status: "OFFLINE" },
  });
});

test("listarDevices devolve o device semente", async () => {
  const ds = await listarDevices();
  expect(ds.length).toBeGreaterThanOrEqual(1);
});

test("criarComando é idempotente por dedupeKey", async () => {
  const device = (await listarDevices())[0];
  const a = await criarComando({ deviceId: device.id, type: "ENABLE", dedupeKey: "t-enable-1", payload: { x: 1 } });
  const b = await criarComando({ deviceId: device.id, type: "ENABLE", dedupeKey: "t-enable-1", payload: { x: 1 } });
  expect(b.id).toBe(a.id); // mesma dedupeKey → não duplica
});

test("overridesAtivosDe filtra por expiração", async () => {
  const p = await prisma.person.findFirstOrThrow();
  await prisma.manualAccessOverride.create({ data: { personId: p.id, action: "ALLOW", reason: "teste", expiresAt: new Date(Date.now() + 3600_000) } });
  const ativos = await overridesAtivosDe(p.id);
  expect(ativos.length).toBeGreaterThanOrEqual(1);
});
