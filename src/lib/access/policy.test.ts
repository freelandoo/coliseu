import { expect, test } from "vitest";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import type { AccessContext } from "@/lib/access/types";

const base: AccessContext = {
  membershipStatus: "ACTIVE", billingStatus: "PAID", diasAtraso: 0, graceDays: 5,
  courtesyEntriesLeft: 1, temCredencialEnrolled: true, sincronizado: true,
  overrideAtivo: null, agora: new Date("2026-07-06T10:00:00Z"),
};

test("ativo + pago + sincronizado → ALLOWED", () => {
  const d = evaluateAccessEligibility(base);
  expect(d.allow).toBe(true);
  expect(d.status).toBe("ALLOWED");
});

test("sem biometria → DENIED PENDING_ENROLLMENT", () => {
  const d = evaluateAccessEligibility({ ...base, temCredencialEnrolled: false });
  expect(d.allow).toBe(false);
  expect(d.status).toBe("PENDING_ENROLLMENT");
});

test("enrolled mas não sincronizado → PENDING_SYNC (nega)", () => {
  const d = evaluateAccessEligibility({ ...base, sincronizado: false });
  expect(d.allow).toBe(false);
  expect(d.status).toBe("PENDING_SYNC");
});

test("aguardando 1º pagamento com cortesia → ALLOWED consumindo cortesia", () => {
  const d = evaluateAccessEligibility({ ...base, membershipStatus: "PENDING_PAYMENT", billingStatus: "PENDING", courtesyEntriesLeft: 1 });
  expect(d.allow).toBe(true);
  expect(d.reason).toBe("CORTESIA");
  expect(d.consumirCortesia).toBe(true);
});

test("aguardando pagamento sem cortesia → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, membershipStatus: "PENDING_PAYMENT", billingStatus: "PENDING", courtesyEntriesLeft: 0 });
  expect(d.allow).toBe(false);
  expect(d.reason).toBe("AGUARDANDO_PAGAMENTO");
});

test("ATIVO com próxima fatura emitida (PENDING, não vencida) → ALLOWED, sem consumir cortesia", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "PENDING", diasAtraso: -5 });
  expect(d.allow).toBe(true);
  expect(d.reason).toBe("OK");
  expect(d.consumirCortesia).toBe(false);
});

test("ATIVO com fatura PENDING já vencida (webhook OVERDUE atrasado) → carência", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "PENDING", diasAtraso: 3 });
  expect(d.allow).toBe(true);
  expect(d.status).toBe("GRACE");
  const negado = evaluateAccessEligibility({ ...base, billingStatus: "PENDING", diasAtraso: 10 });
  expect(negado.allow).toBe(false);
  expect(negado.reason).toBe("INADIMPLENTE");
});

test("vencido dentro da carência → GRACE (libera)", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "OVERDUE", diasAtraso: 3, graceDays: 5 });
  expect(d.allow).toBe(true);
  expect(d.status).toBe("GRACE");
});

test("vencido além da carência → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "OVERDUE", diasAtraso: 6, graceDays: 5 });
  expect(d.allow).toBe(false);
  expect(d.reason).toBe("INADIMPLENTE");
});

test("cancelado → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, membershipStatus: "CANCELED" });
  expect(d.allow).toBe(false);
  expect(d.reason).toBe("CANCELADO");
});

test("chargeback → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "CHARGEBACK" });
  expect(d.allow).toBe(false);
});

test("override BLOCK vence tudo", () => {
  const d = evaluateAccessEligibility({ ...base, overrideAtivo: "BLOCK" });
  expect(d.allow).toBe(false);
  expect(d.status).toBe("MANUAL_OVERRIDE");
});

test("override ALLOW libera mesmo inadimplente", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "OVERDUE", diasAtraso: 30, overrideAtivo: "ALLOW" });
  expect(d.allow).toBe(true);
  expect(d.status).toBe("MANUAL_OVERRIDE");
});
