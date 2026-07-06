import { expect, test } from "vitest";
import { upsertPaymentRepo, paymentPorAsaasId } from "@/lib/repositories/billing";

test("upsertPaymentRepo cria e depois atualiza por asaasPaymentId (idempotente)", async () => {
  const dueDate = new Date("2026-08-01");
  const a = await upsertPaymentRepo({
    asaasPaymentId: "pay_test_f2", value: 100, dueDate, status: "PENDING",
    statusUpdatedAt: new Date("2026-07-01T10:00:00Z"),
  });
  expect(a.status).toBe("PENDING");
  const b = await upsertPaymentRepo({
    asaasPaymentId: "pay_test_f2", value: 100, dueDate, status: "PAID",
    statusUpdatedAt: new Date("2026-07-02T10:00:00Z"), paidAt: new Date("2026-07-02T10:00:00Z"),
  });
  expect(b.id).toBe(a.id);
  expect(b.status).toBe("PAID");
  const found = await paymentPorAsaasId("pay_test_f2");
  expect(found?.status).toBe("PAID");
});
