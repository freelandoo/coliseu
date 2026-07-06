import { prisma } from "@/lib/db";
import type { PaymentStatus } from "@prisma/client";

interface AsaasEvent {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: {
    id: string;
    status?: string;
    value?: number;
    dueDate?: string;
    paymentDate?: string;
    invoiceUrl?: string;
    subscription?: string;
  };
}

function statusDoEvento(event: string): PaymentStatus | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": return "PAID";
    case "PAYMENT_OVERDUE": return "OVERDUE";
    case "PAYMENT_REFUNDED": return "REFUNDED";
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE": return "CHARGEBACK";
    case "PAYMENT_DELETED": return "CANCELED";
    default: return null;
  }
}

function cobrancaStatusDe(s: PaymentStatus): "pago" | "atrasado" | "pendente" {
  if (s === "PAID") return "pago";
  if (s === "OVERDUE") return "atrasado";
  return "pendente";
}
function membershipStatusDe(s: PaymentStatus): "ACTIVE" | "SUSPENDED" | null {
  if (s === "PAID") return "ACTIVE";
  if (s === "OVERDUE" || s === "CHARGEBACK") return "SUSPENDED";
  return null;
}

export async function processarEvento(ev: AsaasEvent): Promise<void> {
  const novoStatus = statusDoEvento(ev.event);
  if (!novoStatus || !ev.payment?.id) return;

  const payment = ev.payment;
  const asaasPaymentId = payment.id;
  const eventAt = ev.dateCreated ? new Date(ev.dateCreated) : new Date();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { asaasPaymentId } });

    if (existing && existing.statusUpdatedAt > eventAt) return;
    if (existing && existing.status === novoStatus && existing.statusUpdatedAt.getTime() === eventAt.getTime()) return;

    const paidAt = novoStatus === "PAID"
      ? (payment.paymentDate ? new Date(payment.paymentDate) : eventAt)
      : null;

    await tx.payment.upsert({
      where: { asaasPaymentId },
      create: {
        asaasPaymentId,
        value: payment.value ?? existing?.value ?? 0,
        dueDate: payment.dueDate ? new Date(payment.dueDate) : (existing?.dueDate ?? eventAt),
        status: novoStatus,
        paidAt,
        invoiceUrl: payment.invoiceUrl ?? null,
        statusUpdatedAt: eventAt,
      },
      update: { status: novoStatus, paidAt, statusUpdatedAt: eventAt },
    });

    const cob = await tx.cobranca.findFirst({ where: { asaasId: asaasPaymentId } });
    if (cob) {
      await tx.cobranca.update({ where: { id: cob.id }, data: { status: cobrancaStatusDe(novoStatus) } });
      const ms = membershipStatusDe(novoStatus);
      if (ms) await tx.membership.updateMany({ where: { personId: cob.personId }, data: { status: ms } });
    }
  });
}
