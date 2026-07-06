import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { reconciliarPayments } from "@/lib/billing/reconcile";

test("reconciliação também atualiza a Cobranca legada (pay_004 atrasado → pago)", async () => {
  // pay_004 é seed: Cobranca status 'atrasado'. Reconciliar como RECEIVED deve virar 'pago'.
  await reconciliarPayments([{ id: "pay_004", status: "RECEIVED", value: 129.9, dueDate: "2026-06-23", paymentDate: "2026-07-01" }]);
  const cob = await prisma.cobranca.findFirst({ where: { asaasId: "pay_004" } });
  expect(cob?.status).toBe("pago");
});
