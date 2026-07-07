import { prisma } from "@/lib/db";
import type { DeviceCommand } from "@prisma/client";

export async function registrarHeartbeat(input: {
  deviceId: string; firmware?: string; connectivity?: string; clockDriftMs?: number;
}): Promise<{ ok: boolean; erro?: string }> {
  // DEVICE_ID errado no .env do agente é o erro nº 1 de instalação: responde 404
  // claro em vez de estourar 500 (o agente mostra "heartbeat HTTP 404" no log).
  const existe = await prisma.accessDevice.findUnique({ where: { id: input.deviceId }, select: { id: true } });
  if (!existe) return { ok: false, erro: "device desconhecido — confira o DEVICE_ID" };
  await prisma.$transaction([
    prisma.deviceHeartbeat.create({
      data: { deviceId: input.deviceId, firmware: input.firmware ?? null, connectivity: input.connectivity ?? null, clockDriftMs: input.clockDriftMs ?? null },
    }),
    prisma.accessDevice.update({
      where: { id: input.deviceId },
      data: { status: "ONLINE", lastHeartbeatAt: new Date(), firmware: input.firmware ?? undefined },
    }),
  ]);
  return { ok: true };
}

/** Janela após a qual um comando DISPATCHED sem ack volta a ser entregue. */
const REDELIVERY_MS = 2 * 60_000;

export async function entregarComandos(deviceId: string): Promise<DeviceCommand[]> {
  // Reentrega DISPATCHED "órfão" (agente caiu entre o pull e o ack): sem isso um
  // DISABLE de inadimplente ficaria perdido para sempre. Os comandos são idempotentes
  // no device (enable/disable/upsert), então reentregar é seguro.
  const pendentes = await prisma.deviceCommand.findMany({
    where: {
      deviceId,
      OR: [
        { status: "PENDING" },
        { status: "DISPATCHED", dispatchedAt: { lt: new Date(Date.now() - REDELIVERY_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (pendentes.length > 0) {
    await prisma.deviceCommand.updateMany({
      where: { id: { in: pendentes.map((c) => c.id) } },
      data: { status: "DISPATCHED", dispatchedAt: new Date(), attempts: { increment: 1 } },
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
    // UPSERT concluído = pessoa agora existe/sincronizou no device. Reavalia a política
    // para emitir o ENABLE de quem já pagou (sem isso o aluno ficaria IN_SYNC porém
    // desabilitado até o próximo evento de pagamento). Só no UPSERT — repetir no ack
    // de ENABLE geraria loop ENABLE→ack→ENABLE.
    if (cmd.type === "UPSERT_USER") {
      const { recalcularAcessoDePessoa } = await import("@/lib/access/outbox");
      try { await recalcularAcessoDePessoa(cmd.personId); } catch (e) {
        console.error("[ack] recalcular pós-UPSERT falhou:", e);
      }
    }
  }
}

export async function ingestarEvento(input: {
  deviceId: string; deviceEventId: string; externalUserId?: string; personId?: string;
  deviceTime: string; direction: "ENTRY" | "EXIT";
  decision: "ALLOWED" | "DENIED"; reason?: string; physicallyPassed: boolean;
  mode: "ONLINE" | "OFFLINE" | "CONTINGENCY"; cursor?: string;
}): Promise<{ created: boolean }> {
  // Resolve a pessoa: personId explícito (ex.: simulador) tem prioridade; senão pelo mapping.
  let personId: string | null = input.personId ?? null;
  if (!personId && input.externalUserId) {
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

  // Presença real: só giro autorizado e concluído atualiza ultimaPresenca — e só
  // avança (evento antigo/fora de ordem não pode regredir a presença).
  if (personId && input.decision === "ALLOWED" && input.physicallyPassed && input.direction === "ENTRY") {
    const quando = new Date(input.deviceTime);
    await prisma.membership.updateMany({
      where: {
        id: (await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" }, select: { id: true } }))?.id ?? "",
        ultimaPresenca: { lt: quando },
      },
      data: { ultimaPresenca: quando },
    });
  }
  return { created: true };
}
