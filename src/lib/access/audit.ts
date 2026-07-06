import { prisma } from "@/lib/db";

export async function registrarAudit(input: {
  actorType: "USER" | "AGENT" | "SYSTEM" | "WEBHOOK";
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: input.actorType, actorId: input.actorId ?? null,
      action: input.action, entity: input.entity, entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as never, after: (input.after ?? undefined) as never,
      ip: input.ip ?? null,
    },
  });
}
