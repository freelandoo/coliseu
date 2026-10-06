import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { aplicarPagamento, avisarEstorno, statusDoAsaas, type PagamentoAsaas } from "@/lib/billing/aplicar";

export interface AsaasEvent {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: PagamentoAsaas;
  subscription?: { id: string; status?: string; deleted?: boolean };
}

/**
 * Status que o evento impõe. O `payment.status` do corpo é a verdade do Asaas;
 * o nome do evento só decide quando o status não basta (cobrança removida
 * continua PENDING no corpo, com `deleted: true`).
 */
function statusDoEvento(ev: AsaasEvent): PaymentStatus | null {
  if (!ev.event.startsWith("PAYMENT_")) return null;
  switch (ev.event) {
    case "PAYMENT_DELETED": return "CANCELED";
    case "PAYMENT_REFUNDED": return "REFUNDED";
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
    case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL": return "CHARGEBACK";
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": return "PAID";
    case "PAYMENT_OVERDUE": return "OVERDUE";
  }
  return ev.payment?.status ? statusDoAsaas(ev.payment.status) : null;
}

/** Assinatura removida/inativada no painel do Asaas: espelha o status local. */
async function processarAssinatura(ev: AsaasEvent): Promise<void> {
  const sub = ev.subscription;
  if (!sub?.id) return;
  const status =
    ev.event === "SUBSCRIPTION_DELETED" || sub.deleted ? "CANCELED"
    : ev.event === "SUBSCRIPTION_INACTIVATED" ? "INACTIVE"
    : sub.status;
  if (!status) return;
  await prisma.billingSubscription.updateMany({
    where: { asaasSubscriptionId: sub.id },
    data: { status },
  });
}

export async function processarEvento(ev: AsaasEvent): Promise<void> {
  if (ev.event.startsWith("SUBSCRIPTION_")) return processarAssinatura(ev);

  const payment = ev.payment;
  if (!payment?.id) return;
  const eventAt = ev.dateCreated ? new Date(ev.dateCreated.replace(" ", "T")) : new Date();

  // Estorno parcial: o pagamento segue valendo (status RECEIVED), só avisa.
  if (ev.event === "PAYMENT_PARTIALLY_REFUNDED") {
    const local = await prisma.payment.findUnique({
      where: { asaasPaymentId: payment.id },
      select: { personId: true },
    });
    if (local?.personId) await avisarEstorno(payment, "PARCIAL", local.personId);
    return;
  }

  const novoStatus = statusDoEvento(ev);
  if (!novoStatus) return;
  await aplicarPagamento(payment, novoStatus, eventAt);
}
