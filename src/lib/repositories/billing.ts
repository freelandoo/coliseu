import { prisma } from "@/lib/db";
import type { Payment, PaymentStatus, BillingCustomer, BillingSubscription } from "@prisma/client";

export interface UpsertPaymentInput {
  asaasPaymentId: string;
  subscriptionId?: string | null;
  externalReference?: string | null;
  billingType?: string;
  value: number;
  dueDate: Date;
  status: PaymentStatus;
  paidAt?: Date | null;
  invoiceUrl?: string | null;
  statusUpdatedAt: Date;
}

export async function upsertPaymentRepo(input: UpsertPaymentInput): Promise<Payment> {
  return prisma.payment.upsert({
    where: { asaasPaymentId: input.asaasPaymentId },
    create: {
      asaasPaymentId: input.asaasPaymentId,
      subscriptionId: input.subscriptionId ?? null,
      externalReference: input.externalReference ?? null,
      billingType: input.billingType ?? "UNDEFINED",
      value: input.value,
      dueDate: input.dueDate,
      status: input.status,
      paidAt: input.paidAt ?? null,
      invoiceUrl: input.invoiceUrl ?? null,
      statusUpdatedAt: input.statusUpdatedAt,
    },
    update: {
      value: input.value,
      dueDate: input.dueDate,
      status: input.status,
      paidAt: input.paidAt ?? null,
      invoiceUrl: input.invoiceUrl ?? undefined,
      statusUpdatedAt: input.statusUpdatedAt,
    },
  });
}

export async function paymentPorAsaasId(asaasPaymentId: string): Promise<Payment | null> {
  return prisma.payment.findUnique({ where: { asaasPaymentId } });
}

export async function upsertBillingCustomerRepo(input: {
  asaasCustomerId: string; personId: string; externalReference?: string | null;
}): Promise<BillingCustomer> {
  return prisma.billingCustomer.upsert({
    where: { asaasCustomerId: input.asaasCustomerId },
    create: { asaasCustomerId: input.asaasCustomerId, personId: input.personId, externalReference: input.externalReference ?? input.personId },
    update: { externalReference: input.externalReference ?? undefined },
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
