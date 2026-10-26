import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { criarPessoaRepo, matricularPessoaRepo } from "@/lib/repositories/pessoas";
import { aplicarPagamento } from "@/lib/billing/aplicar";
import { cancelarAssinaturasAnteriores } from "@/lib/billing/cobrancas";

// Ids únicos por execução: o banco de teste não é limpo entre rodadas.
const k = Date.now();

test("matrícula com dados Asaas grava BillingCustomer/Subscription/Payment", async () => {
  const p = await criarPessoaRepo({ nome: "Billing Teste", origem: "balcao", telefone: "(11) 90000-0000", cpf: "111.222.333-44" });
  await matricularPessoaRepo(p.id, "p-mensal", {
    customerId: `cus_bt_${k}`, assinaturaId: `sub_bt_${k}`, ciclo: "MONTHLY", cobrancaId: `pay_bt_${k}`,
    linkPagamento: `https://asaas.com/c/pay_bt_${k}`,
  });
  const bc = await prisma.billingCustomer.findUnique({ where: { asaasCustomerId: `cus_bt_${k}` } });
  const pay = await prisma.payment.findUnique({ where: { asaasPaymentId: `pay_bt_${k}` } });
  expect(bc?.personId).toBe(p.id);
  expect(pay?.status).toBe("PENDING");
  const bs = await prisma.billingSubscription.findUnique({ where: { asaasSubscriptionId: `sub_bt_${k}` } });
  expect(bs?.externalReference).toBeTruthy();
  expect(bs?.cycle).toBe("MONTHLY");
});

test("boleto parcelado: parcelas do webhook ligam ao aluno e a renovação cancela as em aberto", async () => {
  const p = await criarPessoaRepo({ nome: "Parcelado Teste", origem: "balcao", telefone: "(11) 90000-0001", cpf: "222.333.444-55" });
  await matricularPessoaRepo(p.id, "p-anual", {
    customerId: `cus_bp_${k}`, assinaturaId: `ins_mock_bp_${k}`, ciclo: "INSTALLMENT", valorCobranca: 79.9,
    cobrancaId: `pay_bp_${k}`, linkPagamento: `https://asaas.com/c/pay_bp_${k}`,
  });
  const bs = await prisma.billingSubscription.findUnique({ where: { asaasSubscriptionId: `ins_mock_bp_${k}` } });
  expect(bs?.cycle).toBe("INSTALLMENT");
  const cob = await prisma.cobranca.findFirst({ where: { asaasId: `pay_bp_${k}` } });
  expect(cob?.valor).toBe(79.9);

  // 1ª parcela paga: matrícula ativa.
  await aplicarPagamento(
    { id: `pay_bp_${k}`, installment: `ins_mock_bp_${k}`, customer: `cus_bp_${k}`, value: 79.9, dueDate: "2026-10-27", paymentDate: "2026-10-27" },
    "PAID",
    new Date(),
  );
  const m = await prisma.membership.findFirst({ where: { personId: p.id }, orderBy: { matriculadoEm: "desc" } });
  expect(m?.status).toBe("ACTIVE");

  // 2ª parcela nasce no Asaas (PAYMENT_CREATED) só com o id do parcelamento.
  await aplicarPagamento(
    { id: `pay_bp2_${k}`, installment: `ins_mock_bp_${k}`, value: 79.9, dueDate: "2026-11-27", description: "Parcela 2 de 12. Plano Anual" },
    "PENDING",
    new Date(),
  );
  const p2 = await prisma.payment.findUnique({ where: { asaasPaymentId: `pay_bp2_${k}` } });
  expect(p2?.personId).toBe(p.id);
  expect(p2?.subscriptionId).toBe(bs?.id);
  const c2 = await prisma.cobranca.findFirst({ where: { asaasId: `pay_bp2_${k}` } });
  expect(c2?.tipo).toBe("mensalidade");
  expect(c2?.assinaturaId).toBe(`ins_mock_bp_${k}`);

  // Troca de plano: parcelamento cancelado, parcela em aberto cai, a paga fica.
  expect(await cancelarAssinaturasAnteriores(p.id)).toBe(1);
  const depois = await prisma.billingSubscription.findUnique({ where: { asaasSubscriptionId: `ins_mock_bp_${k}` } });
  expect(depois?.status).toBe("CANCELED");
  expect((await prisma.payment.findUnique({ where: { asaasPaymentId: `pay_bp2_${k}` } }))?.status).toBe("CANCELED");
  expect((await prisma.payment.findUnique({ where: { asaasPaymentId: `pay_bp_${k}` } }))?.status).toBe("PAID");
});
