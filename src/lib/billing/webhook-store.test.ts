import { expect, test } from "vitest";
import { registrarWebhookEvent } from "@/lib/billing/webhook-store";

test("registrarWebhookEvent é idempotente por asaasEventId", async () => {
  const payload = { id: "evt_f2_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_x", value: 10 } };
  const first = await registrarWebhookEvent("evt_f2_1", payload);
  expect(first.created).toBe(true);
  const second = await registrarWebhookEvent("evt_f2_1", payload);
  expect(second.created).toBe(false);
  expect(second.event.id).toBe(first.event.id);
});
