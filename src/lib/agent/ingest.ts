import { prisma } from "@/lib/db";
import type { DeviceCommand } from "@prisma/client";

export async function registrarHeartbeat(input: {
  deviceId: string; firmware?: string; connectivity?: string; clockDriftMs?: number;
}): Promise<void> {
  await prisma.$transaction([
    prisma.deviceHeartbeat.create({
      data: { deviceId: input.deviceId, firmware: input.firmware ?? null, connectivity: input.connectivity ?? null, clockDriftMs: input.clockDriftMs ?? null },
    }),
    prisma.accessDevice.update({
      where: { id: input.deviceId },
      data: { status: "ONLINE", lastHeartbeatAt: new Date(), firmware: input.firmware ?? undefined },
    }),
  ]);
}

export async function entregarComandos(deviceId: string): Promise<DeviceCommand[]> {
  const pendentes = await prisma.deviceCommand.findMany({
    where: { deviceId, status: "PENDING" }, orderBy: { createdAt: "asc" },
  });
  if (pendentes.length > 0) {
    await prisma.deviceCommand.updateMany({
      where: { id: { in: pendentes.map((c) => c.id) } },
      data: { status: "DISPATCHED", dispatchedAt: new Date() },
    });
  }
  return pendentes;
}

export async function ackComando(input: {
  commandId: string; status: "SUCCEEDED" | "FAILED"; error?: string;
}): Promise<void> {
  const cmd = await prisma.deviceCommand.findUnique({ where: { id: input.commandId } });
  if (!cmd) return;
  await prisma.deviceCommand.update({
    where: { id: cmd.id },
    data: { status: input.status, ackAt: new Date(), lastError: input.error ?? null },
  });
  // Sincroniza o mapping quando o comando de provisionamento deu certo.
  if (input.status === "SUCCEEDED" && cmd.personId &&
      ["UPSERT_USER", "ENABLE", "SYNC_RULES"].includes(cmd.type)) {
    await prisma.deviceUserMapping.updateMany({
      where: { deviceId: cmd.deviceId, personId: cmd.personId },
      data: { syncStatus: "IN_SYNC", lastSyncAt: new Date() },
    });
  }
}

export async function ingestarEvento(input: {
  deviceId: string; deviceEventId: string; externalUserId?: string;
  deviceTime: string; direction: "ENTRY" | "EXIT";
  decision: "ALLOWED" | "DENIED"; reason?: string; physicallyPassed: boolean;
  mode: "ONLINE" | "OFFLINE" | "CONTINGENCY"; cursor?: string;
}): Promise<{ created: boolean }> {
  // Resolve a pessoa pelo mapping (externalUserId → personId).
  let personId: string | null = null;
  if (input.externalUserId) {
    const m = await prisma.deviceUserMapping.findUnique({
      where: { deviceId_externalUserId: { deviceId: input.deviceId, externalUserId: input.externalUserId } },
    });
    personId = m?.personId ?? null;
  }
  const device = await prisma.accessDevice.findUnique({ where: { id: input.deviceId } });

  try {
    await prisma.accessEvent.create({
      data: {
        deviceId: input.deviceId, deviceEventId: input.deviceEventId, personId,
        unitId: device?.unitId ?? "", deviceTime: new Date(input.deviceTime),
        direction: input.direction, decision: input.decision, reason: input.reason ?? null,
        physicallyPassed: input.physicallyPassed, mode: input.mode, deviceCursor: input.cursor ?? null,
      },
    });
  } catch (e) {
    // colisão de unique (deviceId, deviceEventId) = evento duplicado
    const { Prisma } = await import("@prisma/client");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { created: false };
    }
    throw e;
  }

  // Presença real: só giro autorizado e concluído atualiza ultimaPresenca.
  if (personId && input.decision === "ALLOWED" && input.physicallyPassed && input.direction === "ENTRY") {
    const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" } });
    if (m) await prisma.membership.update({ where: { id: m.id }, data: { ultimaPresenca: new Date(input.deviceTime) } });
  }
  return { created: true };
}
