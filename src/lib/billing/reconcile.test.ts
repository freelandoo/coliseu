import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { reconciliarPayments } from "@/lib/billing/reconcile";

test("reconciliarPayments cria payment de cliente conhecido e corrige status divergente", async () => {
  const unitId = (await prisma.unit.findFirstOrThrow()).id;
  const p = await prisma.person.create({
    data: { codigo: "TREC01", nome: "Teste Reconcilia", origem: "balcao", fase: "aluno", unitId },
  });
  await prisma.billingCustomer.create({ data: { asaasCustomerId: "cus_rec_1", personId: p.id } });

  const res = await reconciliarPayments([
    { id: "pay_rec_1", customer: "cus_rec_1", status: "RECEIVED", value: 99.9, dueDate: "2026-08-01", paymentDate: "2026-07-20" },
  ]);
  expect(res.criados).toBe(1);
  const pg = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_rec_1" } });
  expect(pg?.status).toBe("PAID");
  expect(pg?.personId).toBe(p.id);
});

test("cobrança de cliente que o Coliseu não criou (conta compartilhada) é ignorada", async () => {
  const res = await reconciliarPayments([
    { id: "pay_rec_alheio", customer: "cus_de_outro_app", status: "RECEIVED", value: 50, dueDate: "2026-08-01" },
  ]);
  expect(res.ignorados).toBe(1);
  expect(await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_rec_alheio" } })).toBeNull();
});
