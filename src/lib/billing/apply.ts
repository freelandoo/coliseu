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
  if (!ms) return;
  // Só a matrícula MAIS RECENTE muda, e nunca ressuscita CANCELED/EXPIRED:
  // um pagamento atrasado de ex-aluno não pode reativar contrato encerrado.
  const alvo = await tx.membership.findFirst({
    where: { personId: cob.personId }, orderBy: { matriculadoEm: "desc" },
  });
  if (!alvo) return;
  const transicaoValida =
    (ms === "ACTIVE" && ["PENDING_PAYMENT", "SUSPENDED", "ACTIVE"].includes(alvo.status)) ||
    (ms === "SUSPENDED" && alvo.status === "ACTIVE");
  if (transicaoValida && alvo.status !== ms) {
    await tx.membership.update({ where: { id: alvo.id }, data: { status: ms } });
  }
}
