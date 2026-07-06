import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { criarPessoaRepo, matricularPessoaRepo } from "@/lib/repositories/pessoas";

test("matrícula com dados Asaas grava BillingCustomer/Subscription/Payment", async () => {
  const p = await criarPessoaRepo({ nome: "Billing Teste", origem: "balcao", telefone: "(11) 90000-0000", cpf: "111.222.333-44" });
  await matricularPessoaRepo(p.id, "p-mensal", {
    customerId: "cus_bt_1", assinaturaId: "sub_bt_1", cobrancaId: "pay_bt_1",
    linkPagamento: "https://asaas.com/c/pay_bt_1",
  });
  const bc = await prisma.billingCustomer.findUnique({ where: { asaasCustomerId: "cus_bt_1" } });
  const pay = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_bt_1" } });
  expect(bc?.personId).toBe(p.id);
  expect(pay?.status).toBe("PENDING");
});
