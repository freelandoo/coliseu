import { prisma } from "@/lib/db";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import type { AccessContext } from "@/lib/access/types";
import { enfileirarComandoAcesso } from "@/lib/repositories/access";

/** Reavalia o acesso de uma pessoa e enfileira ENABLE/DISABLE por device mapeado. */
export async function recalcularAcessoDePessoa(personId: string): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { personId }, orderBy: { matriculadoEm: "desc" },
  });
  const payment = await prisma.payment.findFirst({
    where: { subscription: { customer: { personId } } },
    orderBy: { statusUpdatedAt: "desc" },
  });
  const credEnrolled = await prisma.accessCredential.count({ where: { personId, status: "ENROLLED" } });
  const mappings = await prisma.deviceUserMapping.findMany({ where: { personId } });
  const sincronizado = mappings.some((m) => m.syncStatus === "IN_SYNC");
  const override = await prisma.manualAccessOverride.findFirst({
    where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });

  const agora = new Date();
  const diasAtraso = payment?.dueDate ? Math.floor((agora.getTime() - payment.dueDate.getTime()) / 86_400_000) : 0;

  const ctx: AccessContext = {
    membershipStatus: membership?.status ?? null,
    billingStatus: payment?.status ?? null,
    diasAtraso,
    graceDays: 5,
    courtesyEntriesLeft: membership?.courtesyEntriesLeft ?? 0,
    temCredencialEnrolled: credEnrolled > 0,
    sincronizado,
    overrideAtivo: override ? (override.action as "ALLOW" | "BLOCK") : null,
    agora,
  };

  const decisao = evaluateAccessEligibility(ctx);
  if (decisao.reason === "CORTESIA") return; // cortesia = decisão online por giro, não ENABLE durável
  const tipo = decisao.allow ? "ENABLE" : "DISABLE";

  for (const m of mappings) {
    await enfileirarComandoAcesso({
      deviceId: m.deviceId, personId, type: tipo,
      payload: { externalUserId: m.externalUserId, reason: decisao.reason },
    });
  }
}
