import { prisma } from "@/lib/db";
import type { AccessContext } from "@/lib/access/types";
import { CARENCIA_DIAS, diasDesde } from "@/lib/billing/regua";
import type { DeviceUserMapping, Membership } from "@prisma/client";

export interface ContextoAcesso {
  ctx: AccessContext;
  membership: Membership | null;
  mappings: DeviceUserMapping[];
}

/**
 * Monta o AccessContext de uma pessoa a partir do banco (contrato + financeiro +
 * credencial + sync + override). Fonte única usada pela reavaliação de acesso
 * (outbox) e pelo simulador de face check.
 */
export async function carregarContextoAcesso(personId: string): Promise<ContextoAcesso> {
  const membership = await prisma.membership.findFirst({
    where: { personId }, orderBy: { matriculadoEm: "desc" },
  });
  // A régua conta da parcela vencida mais antiga ainda aberta (pagar a do mês
  // não apaga a dívida de antes); sem nenhuma vencida, vale a mais recente.
  const agora = new Date();
  const doAluno = { subscription: { customer: { personId } } };
  const payment =
    (await prisma.payment.findFirst({
      where: { ...doAluno, status: { in: ["PENDING", "OVERDUE"] }, dueDate: { lt: agora } },
      orderBy: { dueDate: "asc" },
    })) ??
    (await prisma.payment.findFirst({ where: doAluno, orderBy: { statusUpdatedAt: "desc" } }));
  const credEnrolled = await prisma.accessCredential.count({ where: { personId, status: "ENROLLED" } });
  const mappings = await prisma.deviceUserMapping.findMany({ where: { personId } });
  const sincronizado = mappings.some((m) => m.syncStatus === "IN_SYNC");
  const override = await prisma.manualAccessOverride.findFirst({
    where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });

  const diasAtraso = payment?.dueDate ? diasDesde(payment.dueDate, agora) : 0;

  const ctx: AccessContext = {
    membershipStatus: membership?.status ?? null,
    billingStatus: payment?.status ?? null,
    diasAtraso,
    graceDays: CARENCIA_DIAS,
    courtesyEntriesLeft: membership?.courtesyEntriesLeft ?? 0,
    temCredencialEnrolled: credEnrolled > 0,
    sincronizado,
    overrideAtivo: override ? (override.action as "ALLOW" | "BLOCK") : null,
    agora,
    diasAposVencimentoPlano: membership ? diasDesde(membership.vencimentoPlano, agora) : null,
  };

  return { ctx, membership, mappings };
}
