import { afterAll, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { entregarComandos } from "@/lib/agent/ingest";
import { enfileirarAbertura } from "@/lib/repositories/access";

let deviceId = "";

beforeAll(async () => {
  // Device próprio: os outros testes mexem na fila do device semente.
  const unitId = (await prisma.unit.findFirstOrThrow()).id;
  const d = await prisma.accessDevice.create({
    data: { name: "Teste liberar", unitId, status: "ONLINE" },
  });
  deviceId = d.id;
});

afterAll(async () => {
  await prisma.accessDevice.delete({ where: { id: deviceId } });
});

test("liberação recente é entregue ao agente", async () => {
  const c = await enfileirarAbertura({ deviceId, solicitadoPor: "Recepção", motivo: "visitante" });
  const entregues = await entregarComandos(deviceId);
  expect(entregues.map((x) => x.id)).toContain(c.id);
  expect(entregues.find((x) => x.id === c.id)?.payload).toMatchObject({ motivo: "visitante", solicitadoPor: "Recepção" });
});

test("liberação pendente além da validade expira e nunca abre depois", async () => {
  const c = await enfileirarAbertura({ deviceId, solicitadoPor: "Recepção" });
  await prisma.deviceCommand.update({ where: { id: c.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
  const entregues = await entregarComandos(deviceId);
  expect(entregues.map((x) => x.id)).not.toContain(c.id);
  const depois = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: c.id } });
  expect(depois.status).toBe("FAILED");
  expect(depois.lastError).toMatch(/expirado/);
});

test("liberação entregue sem confirmação não é reentregue (não abre duas vezes)", async () => {
  const c = await enfileirarAbertura({ deviceId, solicitadoPor: "Recepção" });
  await prisma.deviceCommand.update({
    where: { id: c.id },
    data: { status: "DISPATCHED", dispatchedAt: new Date(Date.now() - 10 * 60_000), attempts: 1 },
  });
  const entregues = await entregarComandos(deviceId);
  expect(entregues.map((x) => x.id)).not.toContain(c.id);
  expect((await prisma.deviceCommand.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("FAILED");
});
