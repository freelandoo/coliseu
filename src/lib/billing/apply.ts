import type { Prisma, PaymentStatus } from "@prisma/client";

export function cobrancaStatusDe(s: PaymentStatus): "pago" | "atrasado" | "pendente" {
  if (s === "PAID") return "pago";
  if (s === "OVERDUE") return "atrasado";
  return "pendente";
}
export function membershipStatusDe(s: PaymentStatus): "ACTIVE" | "SUSPENDED" | null {
  if (s === "PAID") return "ACTIVE";
  if (s === "OVERDUE" || s === "CHARGEBACK") return "SUSPENDED";
  return null;
}

/** Projeta o status do pagamento na Cobranca legada + Membership (telas). */
export async function sincronizarCobrancaMembership(
  tx: Prisma.TransactionClient,
  asaasPaymentId: string,
  status: PaymentStatus,
): Promise<void> {
  const cob = await tx.cobranca.findFirst({ where: { asaasId: asaasPaymentId } });
  if (!cob) return;
  await tx.cobranca.update({ where: { id: cob.id }, data: { status: cobrancaStatusDe(status) } });
  const ms = membershipStatusDe(status);
  if (ms) await tx.membership.updateMany({ where: { personId: cob.personId }, data: { status: ms } });
}
