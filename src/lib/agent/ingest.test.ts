import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { registrarHeartbeat, entregarComandos, ackComando, ingestarEvento } from "@/lib/agent/ingest";

let deviceId = "";
let personId = "";
let externalUserId = "";

beforeAll(async () => {
  const device = await prisma.accessDevice.findFirstOrThrow();
  deviceId = device.id;
  const m = await prisma.deviceUserMapping.findFirstOrThrow({ where: { deviceId } });
  personId = m.personId;
  externalUserId = m.externalUserId;
});

test("registrarHeartbeat marca device ONLINE + grava heartbeat", async () => {
  await registrarHeartbeat({ deviceId, firmware: "sim-1.0", connectivity: "ok", clockDriftMs: 12 });
  const d = await prisma.accessDevice.findUnique({ where: { id: deviceId } });
  expect(d?.status).toBe("ONLINE");
  const hb = await prisma.deviceHeartbeat.findFirst({ where: { deviceId }, orderBy: { at: "desc" } });
  expect(hb?.firmware).toBe("sim-1.0");
});

test("entregarComandos marca PENDING como DISPATCHED", async () => {
  const cmd = await prisma.deviceCommand.create({ data: { deviceId, personId, type: "ENABLE", dedupeKey: `ing-${Date.now()}` } });
  const entregues = await entregarComandos(deviceId);
  expect(entregues.some((c) => c.id === cmd.id)).toBe(true);
  const after = await prisma.deviceCommand.findUnique({ where: { id: cmd.id } });
  expect(after?.status).toBe("DISPATCHED");
});

test("ackComando SUCCEEDED marca comando e sincroniza mapping", async () => {
  const cmd = await prisma.deviceCommand.create({ data: { deviceId, personId, type: "UPSERT_USER", dedupeKey: `ing2-${Date.now()}`, status: "DISPATCHED" } });
  await ackComando({ commandId: cmd.id, status: "SUCCEEDED" });
  const after = await prisma.deviceCommand.findUnique({ where: { id: cmd.id } });
  expect(after?.status).toBe("SUCCEEDED");
  const m = await prisma.deviceUserMapping.findFirst({ where: { deviceId, personId } });
  expect(m?.syncStatus).toBe("IN_SYNC");
});

test("ingestarEvento cria AccessEvent (dedupe) e atualiza ultimaPresenca", async () => {
  const r1 = await ingestarEvento({
    deviceId, deviceEventId: "sim-evt-1", externalUserId,
    deviceTime: new Date().toISOString(), direction: "ENTRY",
    decision: "ALLOWED", reason: "OK", physicallyPassed: true, mode: "ONLINE",
  });
  expect(r1.created).toBe(true);
  const r2 = await ingestarEvento({
    deviceId, deviceEventId: "sim-evt-1", externalUserId,
    deviceTime: new Date().toISOString(), direction: "ENTRY",
    decision: "ALLOWED", reason: "OK", physicallyPassed: true, mode: "ONLINE",
  });
  expect(r2.created).toBe(false); // dedupe
  const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" } });
  expect(m?.ultimaPresenca).toBeTruthy();
});
