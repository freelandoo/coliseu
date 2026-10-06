import { prisma } from "@/lib/db";
import { ehIdAsaasReal } from "@/lib/asaas";
import type { Payment, PaymentStatus, BillingCustomer, BillingSubscription } from "@prisma/client";

export interface UpsertPaymentInput {
  asaasPaymentId: string;
  subscriptionId?: string | null;
  personId?: string | null;
  externalReference?: string | null;
  billingType?: string;
  value: number;
  dueDate: Date;
  status: PaymentStatus;
  paidAt?: Date | null;
  invoiceUrl?: string | null;
  statusUpdatedAt: Date;
}

/**
 * Cria ou atualiza a cobrança. Status/valores só mudam se a escrita for mais
 * nova que a última (o webhook pode ter chegado antes da tela); vínculos com
 * pessoa/assinatura sempre se completam.
 */
export async function upsertPaymentRepo(input: UpsertPaymentInput): Promise<Payment> {
  const atual = await prisma.payment.findUnique({ where: { asaasPaymentId: input.asaasPaymentId } });
  if (!atual) {
    return prisma.payment.create({
      data: {
        asaasPaymentId: input.asaasPaymentId,
        subscriptionId: input.subscriptionId ?? null,
        personId: input.personId ?? null,
        externalReference: input.externalReference ?? null,
        billingType: input.billingType ?? "UNDEFINED",
        value: input.value,
        dueDate: input.dueDate,
        status: input.status,
        paidAt: input.paidAt ?? null,
        invoiceUrl: input.invoiceUrl ?? null,
        statusUpdatedAt: input.statusUpdatedAt,
      },
    });
  }
  const maisNova = input.statusUpdatedAt > atual.statusUpdatedAt;
  return prisma.payment.update({
    where: { id: atual.id },
    data: {
      subscriptionId: atual.subscriptionId ?? input.subscriptionId ?? null,
      personId: atual.personId ?? input.personId ?? null,
      invoiceUrl: atual.invoiceUrl ?? input.invoiceUrl ?? null,
      ...(maisNova && {
        value: input.value,
        dueDate: input.dueDate,
        status: input.status,
        paidAt: input.paidAt ?? null,
        statusUpdatedAt: input.statusUpdatedAt,
      }),
    },
  });
}

export async function paymentPorAsaasId(asaasPaymentId: string): Promise<Payment | null> {
  return prisma.payment.findUnique({ where: { asaasPaymentId } });
}

/**
 * Um cliente de cobrança por pessoa. Id real do Asaas substitui id local
 * (mock/balcão); o contrário nunca — venda de balcão não pode apagar o
 * vínculo com o cliente que existe no Asaas.
 */
export async function upsertBillingCustomerRepo(input: {
  asaasCustomerId: string; personId: string; externalReference?: string | null;
}): Promise<BillingCustomer> {
  const atual = await prisma.billingCustomer.findUnique({ where: { personId: input.personId } });
  if (!atual) {
    return prisma.billingCustomer.create({
      data: { asaasCustomerId: input.asaasCustomerId, personId: input.personId, externalReference: input.externalReference ?? input.personId },
    });
  }
  const manter =
    atual.asaasCustomerId === input.asaasCustomerId ||
    (ehIdAsaasReal(atual.asaasCustomerId) && !ehIdAsaasReal(input.asaasCustomerId));
  if (manter) return atual;
  return prisma.billingCustomer.update({
    where: { id: atual.id },
    data: { asaasCustomerId: input.asaasCustomerId, externalReference: input.externalReference ?? undefined },
  });
}

export async function upsertBillingSubscriptionRepo(input: {
  asaasSubscriptionId: string; customerId: string; value: number;
  cycle?: string; status?: string; externalReference?: string | null;
}): Promise<BillingSubscription> {
  return prisma.billingSubscription.upsert({
    where: { asaasSubscriptionId: input.asaasSubscriptionId },
    create: {
      asaasSubscriptionId: input.asaasSubscriptionId, customerId: input.customerId,
      value: input.value, cycle: input.cycle ?? "MONTHLY", status: input.status ?? "ACTIVE",
      externalReference: input.externalReference ?? null,
    },
    update: { value: input.value, status: input.status ?? undefined },
  });
}

export async function listarPaymentsRepo(): Promise<Payment[]> {
  return prisma.payment.findMany({ orderBy: { dueDate: "asc" } });
}
