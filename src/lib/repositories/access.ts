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

/**
 * Enfileira o comando DESEJADO para (device, person), reconciliando o estado:
 * - se já há um comando pendente/dispatched do MESMO tipo → idempotente (retorna ele);
 * - se há pendente de tipo OPOSTO → marca como superseded (FAILED) e cria o novo;
 * - senão cria um novo (dedupeKey único por emissão).
 */
export async function enfileirarComandoAcesso(input: {
  deviceId: string; personId: string; type: "ENABLE" | "DISABLE"; payload?: unknown;
}): Promise<DeviceCommand> {
  const pendentes = await prisma.deviceCommand.findMany({
    where: { deviceId: input.deviceId, personId: input.personId, status: { in: ["PENDING", "DISPATCHED"] } },
    orderBy: { createdAt: "desc" },
  });
  const mesmoTipo = pendentes.find((c) => c.type === input.type);
  if (mesmoTipo) return mesmoTipo; // já há o comando desejado pendente
  // supersede pendentes de tipo oposto
  const opostos = pendentes.filter((c) => c.type !== input.type);
  if (opostos.length > 0) {
    await prisma.deviceCommand.updateMany({
      where: { id: { in: opostos.map((c) => c.id) } },
      data: { status: "FAILED", lastError: `superseded by ${input.type}` },
    });
  }
  return prisma.deviceCommand.create({
    data: {
      deviceId: input.deviceId, personId: input.personId, type: input.type,
      dedupeKey: `${input.type}:${input.deviceId}:${input.personId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
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
