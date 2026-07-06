import { prisma } from "@/lib/db";
import type { AccessDevice, DeviceCommand, ManualAccessOverride } from "@prisma/client";

export async function listarDevices(): Promise<AccessDevice[]> {
  return prisma.accessDevice.findMany({ orderBy: { name: "asc" } });
}

export async function criarComando(input: {
  deviceId: string; type: string; dedupeKey: string; payload?: unknown;
}): Promise<DeviceCommand> {
  const existing = await prisma.deviceCommand.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return existing;
  return prisma.deviceCommand.create({
    data: {
      deviceId: input.deviceId, type: input.type, dedupeKey: input.dedupeKey,
      payload: (input.payload ?? undefined) as never,
    },
  });
}

export async function comandosPendentes(deviceId: string): Promise<DeviceCommand[]> {
  return prisma.deviceCommand.findMany({
    where: { deviceId, status: { in: ["PENDING", "DISPATCHED"] } },
    orderBy: { createdAt: "asc" },
  });
}

export async function overridesAtivosDe(personId: string): Promise<ManualAccessOverride[]> {
  const agora = new Date();
  return prisma.manualAccessOverride.findMany({
    where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }] },
    orderBy: { createdAt: "desc" },
  });
}

export async function criarOverride(input: {
  personId: string; action: "ALLOW" | "BLOCK"; reason: string; expiresAt?: Date | null; createdByUserId?: string;
}): Promise<ManualAccessOverride> {
  return prisma.manualAccessOverride.create({
    data: {
      personId: input.personId, action: input.action, reason: input.reason,
      expiresAt: input.expiresAt ?? null, createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function revogarCredencial(id: string): Promise<boolean> {
  const c = await prisma.accessCredential.findUnique({ where: { id } });
  if (!c) return false;
  await prisma.accessCredential.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
  return true;
}
