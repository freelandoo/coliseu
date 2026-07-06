import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { PaymentStatus } from "@prisma/client";
import { sincronizarCobrancaMembership } from "@/lib/billing/apply";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";

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

export async function processarEvento(ev: AsaasEvent): Promise<void> {
  const novoStatus = statusDoEvento(ev.event);
  if (!novoStatus || !ev.payment?.id) return;

  const payment = ev.payment;
  const asaasPaymentId = payment.id;
  const eventAt = ev.dateCreated ? new Date(ev.dateCreated) : new Date();

  let afetadoPersonId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { asaasPaymentId } });

    const paidAt = novoStatus === "PAID"
      ? (payment.paymentDate ? new Date(payment.paymentDate) : eventAt)
      : null;

    let aplicado = false;

    if (!existing) {
      try {
        await tx.payment.create({
          data: {
            asaasPaymentId,
            value: payment.value ?? 0,
            dueDate: payment.dueDate ? new Date(payment.dueDate) : eventAt,
            status: novoStatus,
            paidAt,
            invoiceUrl: payment.invoiceUrl ?? null,
            statusUpdatedAt: eventAt,
          },
        });
        aplicado = true;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
          throw e;
        }
        // Criação concorrente já inseriu o registro — cai para o update condicional abaixo.
        const res = await tx.payment.updateMany({
          where: { asaasPaymentId, statusUpdatedAt: { lt: eventAt } },
          data: { status: novoStatus, paidAt, statusUpdatedAt: eventAt },
        });
        aplicado = res.count > 0;
      }
    } else {
      const res = await tx.payment.updateMany({
        where: { asaasPaymentId, statusUpdatedAt: { lt: eventAt } },
        data: { status: novoStatus, paidAt, statusUpdatedAt: eventAt },
      });
      aplicado = res.count > 0;
    }

    if (aplicado) {
      await sincronizarCobrancaMembership(tx, asaasPaymentId, novoStatus);
      const cob = await tx.cobranca.findFirst({ where: { asaasId: asaasPaymentId } });
      if (cob) afetadoPersonId = cob.personId;
    }
  });

  if (afetadoPersonId) {
    try { await recalcularAcessoDePessoa(afetadoPersonId); } catch (e) { console.error("[outbox] falha ao recalcular acesso:", e); }
  }
}
