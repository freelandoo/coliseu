import { prisma } from "@/lib/db";
import { upsertPaymentRepo } from "@/lib/repositories/billing";
import { sincronizarCobrancaMembership } from "@/lib/billing/apply";
import type { PaymentStatus } from "@prisma/client";

export interface AsaasPaymentLike {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  subscription?: string;
}

function mapStatus(s: string): PaymentStatus {
  switch (s) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH": return "PAID";
    case "OVERDUE": return "OVERDUE";
    case "REFUNDED": return "REFUNDED";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE": return "CHARGEBACK";
    case "DELETED": return "CANCELED";
    default: return "PENDING";
  }
}

export async function reconciliarPayments(
  asaasPayments: AsaasPaymentLike[],
): Promise<{ criados: number; atualizados: number; total: number }> {
  let criados = 0;
  let atualizados = 0;
  for (const ap of asaasPayments) {
    const status = mapStatus(ap.status);
    const existing = await prisma.payment.findUnique({ where: { asaasPaymentId: ap.id } });
    await upsertPaymentRepo({
      asaasPaymentId: ap.id,
      value: ap.value,
      dueDate: new Date(ap.dueDate),
      status,
      paidAt: status === "PAID" ? new Date(ap.paymentDate ?? ap.dueDate) : null,
      invoiceUrl: ap.invoiceUrl ?? null,
      statusUpdatedAt: new Date(),
    });
    await prisma.$transaction(async (tx) => sincronizarCobrancaMembership(tx, ap.id, status));
    if (existing) atualizados++;
    else criados++;
  }
  return { criados, atualizados, total: asaasPayments.length };
}
