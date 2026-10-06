import type { Prisma, PaymentStatus } from "@prisma/client";

export type CobrancaStatusDb = "pendente" | "pago" | "atrasado" | "cancelado" | "estornado";

export function cobrancaStatusDe(s: PaymentStatus): CobrancaStatusDb {
  if (s === "PAID") return "pago";
  if (s === "OVERDUE") return "atrasado";
  if (s === "CANCELED") return "cancelado";
  if (s === "REFUNDED" || s === "CHARGEBACK") return "estornado";
  return "pendente";
}
export function membershipStatusDe(s: PaymentStatus): "ACTIVE" | "SUSPENDED" | null {
  if (s === "PAID") return "ACTIVE";
  if (s === "OVERDUE" || s === "CHARGEBACK") return "SUSPENDED";
  return null;
}

/** dueDate + 1 mês civil (mensalidade paga cobre até o próximo vencimento). */
function maisUmMes(d: Date): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + 1);
  return r;
}

/**
 * Projeta o status do pagamento na matrícula MAIS RECENTE da pessoa.
 * Nunca ressuscita CANCELED/EXPIRED: um pagamento atrasado de ex-aluno não
 * pode reativar contrato encerrado.
 *
 * `cobertoAte`: vencimento da mensalidade paga (vindo do Asaas). Estende o
 * vencimento do plano para um mês depois dele — assinatura recorrente em dia
 * não pode aparecer como "a renovar". Só estende, nunca encurta.
 */
export async function sincronizarMembership(
  tx: Prisma.TransactionClient,
  personId: string,
  status: PaymentStatus,
  cobertoAte?: Date | null,
): Promise<void> {
  const ms = membershipStatusDe(status);
  if (!ms) return;
  const alvo = await tx.membership.findFirst({
    where: { personId }, orderBy: { matriculadoEm: "desc" },
  });
  if (!alvo) return;
  const transicaoValida =
    (ms === "ACTIVE" && ["PENDING_PAYMENT", "SUSPENDED", "ACTIVE"].includes(alvo.status)) ||
    (ms === "SUSPENDED" && alvo.status === "ACTIVE");
  if (!transicaoValida) return;

  const data: Prisma.MembershipUpdateInput = {};
  if (alvo.status !== ms) data.status = ms;
  if (ms === "ACTIVE" && cobertoAte) {
    const novo = maisUmMes(cobertoAte);
    if (novo > alvo.vencimentoPlano) data.vencimentoPlano = novo;
  }
  if (Object.keys(data).length > 0) {
    await tx.membership.update({ where: { id: alvo.id }, data });
  }
}

/** Projeta o status do pagamento na Cobranca legada + Membership (telas). */
export async function sincronizarCobrancaMembership(
  tx: Prisma.TransactionClient,
  asaasPaymentId: string,
  status: PaymentStatus,
  cobertoAte?: Date | null,
): Promise<void> {
  const cob = await tx.cobranca.findFirst({ where: { asaasId: asaasPaymentId } });
  if (!cob) return;
  await tx.cobranca.update({ where: { id: cob.id }, data: { status: cobrancaStatusDe(status) } });
  // Cobrança avulsa (taxa, produto) não mexe no contrato.
  if (cob.tipo === "avulsa") return;
  await sincronizarMembership(tx, cob.personId, status, cobertoAte);
}
