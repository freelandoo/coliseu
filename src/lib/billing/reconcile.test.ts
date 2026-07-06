import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { reconciliarPayments } from "@/lib/billing/reconcile";

test("reconciliarPayments cria payment ausente e corrige status divergente", async () => {
  const res = await reconciliarPayments([
    { id: "pay_rec_1", status: "RECEIVED", value: 99.9, dueDate: "2026-08-01", paymentDate: "2026-07-20" },
  ]);
  expect(res.criados).toBeGreaterThanOrEqual(1);
  const p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_rec_1" } });
  expect(p?.status).toBe("PAID");
});
