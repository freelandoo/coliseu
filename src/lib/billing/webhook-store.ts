import { prisma } from "@/lib/db";
import type { WebhookEvent } from "@prisma/client";
import { Prisma } from "@prisma/client";

interface AsaasEventPayload {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: { id?: string; dateCreated?: string };
}

export async function registrarWebhookEvent(
  asaasEventId: string,
  payload: AsaasEventPayload,
): Promise<{ created: boolean; event: WebhookEvent }> {
  const eventAtRaw = payload.dateCreated ?? payload.payment?.dateCreated;
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        asaasEventId,
        event: payload.event ?? "UNKNOWN",
        paymentId: payload.payment?.id ?? null,
        payload: payload as unknown as Prisma.InputJsonValue,
        eventAt: eventAtRaw ? new Date(eventAtRaw) : null,
      },
    });
    return { created: true, event };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { asaasEventId } });
      return { created: false, event };
    }
    throw e;
  }
}

export async function marcarEventoProcessado(id: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id },
    data: { processState: "PROCESSED", processedAt: new Date() },
  });
}

export async function marcarEventoFalho(id: string, erro: string, deadLetter = false): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id },
    data: {
      processState: deadLetter ? "DEAD_LETTER" : "FAILED",
      lastError: erro.slice(0, 500),
      attempts: { increment: 1 },
    },
  });
}
