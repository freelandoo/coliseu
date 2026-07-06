import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { processarEvento } from "@/lib/billing/processor";

async function novoPayment(asaasPaymentId: string) {
  return prisma.payment.create({
    data: {
      asaasPaymentId, value: 129.9, dueDate: new Date("2026-08-01"),
      status: "PENDING", statusUpdatedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
}

test("PAYMENT_RECEIVED marca Payment PAID; reprocessar não muda nada (idempotente)", async () => {
  await novoPayment("pay_proc_1");
  const ev = {
    id: "evt_proc_1", event: "PAYMENT_RECEIVED",
    dateCreated: "2026-07-05T12:00:00Z",
    payment: { id: "pay_proc_1", status: "RECEIVED", paymentDate: "2026-07-05" },
  };
  await processarEvento(ev as never);
  let p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_proc_1" } });
  expect(p?.status).toBe("PAID");
  const paidAt1 = p?.paidAt?.toISOString();
  await processarEvento(ev as never);
  p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_proc_1" } });
  expect(p?.status).toBe("PAID");
  expect(p?.paidAt?.toISOString()).toBe(paidAt1);
});

test("evento fora de ordem não regride status (OVERDUE antigo após RECEIVED novo)", async () => {
  await novoPayment("pay_proc_2");
  await processarEvento({
    id: "evt_proc_2a", event: "PAYMENT_RECEIVED", dateCreated: "2026-07-10T12:00:00Z",
    payment: { id: "pay_proc_2", status: "RECEIVED", paymentDate: "2026-07-10" },
  } as never);
  await processarEvento({
    id: "evt_proc_2b", event: "PAYMENT_OVERDUE", dateCreated: "2026-07-08T12:00:00Z",
    payment: { id: "pay_proc_2", status: "OVERDUE" },
  } as never);
  const p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_proc_2" } });
  expect(p?.status).toBe("PAID");
});
