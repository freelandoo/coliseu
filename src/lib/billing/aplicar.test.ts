import { beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { processarEvento } from "@/lib/billing/processor";
import {
  cancelarAssinaturasAnteriores,
  cancelarCobranca,
  gerarCobrancaAvulsaParaPessoa,
} from "@/lib/billing/cobrancas";
import { upsertBillingCustomerRepo, upsertPaymentRepo } from "@/lib/repositories/billing";

let unitId = "";
let planId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
});

/** Aluno ativo com cliente + assinatura no Asaas (ids de teste). */
async function alunoComAssinatura(codigo: string) {
  const p = await prisma.person.create({
    data: { codigo, nome: `Teste ${codigo}`, origem: "balcao", fase: "aluno", unitId },
  });
  const m = await prisma.membership.create({
    data: { personId: p.id, planId, status: "ACTIVE", vencimentoPlano: new Date("2026-08-01T12:00:00Z") },
  });
  const bc = await prisma.billingCustomer.create({ data: { asaasCustomerId: `cus_${codigo}`, personId: p.id } });
  const bs = await prisma.billingSubscription.create({
    data: { asaasSubscriptionId: `sub_${codigo}`, customerId: bc.id, value: 129.9 },
  });
  return { p, m, bc, bs };
}

function evento(event: string, payment: Record<string, unknown>, quando: string) {
  return { id: `evt_${event}_${payment.id}_${quando}`, event, dateCreated: quando, payment } as never;
}

test("mensalidade recorrente criada no Asaas liga ao aluno e aparece na Cobrança", async () => {
  const { p, bs } = await alunoComAssinatura("TAPL01");
  await processarEvento(evento("PAYMENT_CREATED", {
    id: "pay_apl_1", customer: "cus_TAPL01", subscription: "sub_TAPL01", billingType: "UNDEFINED",
    status: "PENDING", value: 129.9, dueDate: "2026-08-10", invoiceUrl: "https://sandbox.asaas.com/i/1",
  }, "2026-07-31T10:00:00Z"));

  const pg = await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: "pay_apl_1" } });
  expect(pg.personId).toBe(p.id);
  expect(pg.subscriptionId).toBe(bs.id);
  expect(pg.status).toBe("PENDING");
  const cob = await prisma.cobranca.findFirstOrThrow({ where: { asaasId: "pay_apl_1" } });
  expect(cob.tipo).toBe("mensalidade");
  expect(cob.status).toBe("pendente");
  expect(cob.linkPagamento).toBe("https://sandbox.asaas.com/i/1");
});

test("pagamento recebido grava a forma escolhida e estende o vencimento do plano", async () => {
  const { m } = await alunoComAssinatura("TAPL02");
  const pay = {
    id: "pay_apl_2", customer: "cus_TAPL02", subscription: "sub_TAPL02",
    value: 129.9, dueDate: "2026-08-10", invoiceUrl: "https://sandbox.asaas.com/i/2",
  };
  await processarEvento(evento("PAYMENT_CREATED", { ...pay, status: "PENDING", billingType: "UNDEFINED" }, "2026-07-31T10:00:00Z"));
  await processarEvento(evento("PAYMENT_RECEIVED", {
    ...pay, status: "RECEIVED", billingType: "PIX", paymentDate: "2026-08-09",
  }, "2026-08-09T15:00:00Z"));

  const pg = await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: "pay_apl_2" } });
  expect(pg.status).toBe("PAID");
  expect(pg.billingType).toBe("PIX");
  const ms = await prisma.membership.findUniqueOrThrow({ where: { id: m.id } });
  expect(ms.status).toBe("ACTIVE");
  expect(ms.vencimentoPlano.toISOString().slice(0, 10)).toBe("2026-09-10");
  expect((await prisma.cobranca.findFirstOrThrow({ where: { asaasId: "pay_apl_2" } })).status).toBe("pago");
});

test("estorno avisa cada admin uma vez só, mesmo com o webhook reentregue", async () => {
  const { p } = await alunoComAssinatura("TAPL03");
  const pay = { id: "pay_apl_3", customer: "cus_TAPL03", subscription: "sub_TAPL03", value: 129.9, dueDate: "2026-08-10", billingType: "CREDIT_CARD" };
  await processarEvento(evento("PAYMENT_CONFIRMED", { ...pay, status: "CONFIRMED" }, "2026-08-10T10:00:00Z"));
  const estorno = evento("PAYMENT_REFUNDED", { ...pay, status: "REFUNDED" }, "2026-08-12T10:00:00Z");
  await processarEvento(estorno);
  await processarEvento(estorno);

  const pg = await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: "pay_apl_3" } });
  expect(pg.status).toBe("REFUNDED");
  expect((await prisma.cobranca.findFirstOrThrow({ where: { asaasId: "pay_apl_3" } })).status).toBe("estornado");

  const admins = await prisma.user.count({ where: { ativo: true, role: "ADMIN" } });
  expect(admins).toBeGreaterThan(0);
  const avisos = await prisma.notificacao.findMany({ where: { chave: { endsWith: ":pay_apl_3" } } });
  expect(avisos).toHaveLength(admins);
  expect(avisos[0].tipo).toBe("pagamento_estornado");
  expect(avisos[0].titulo).toContain(p.nome);
  expect(avisos[0].corpo).toContain("cartão de crédito");
});

test("chargeback suspende a matrícula e avisa como chargeback", async () => {
  const { m } = await alunoComAssinatura("TAPL04");
  const pay = { id: "pay_apl_4", customer: "cus_TAPL04", subscription: "sub_TAPL04", value: 129.9, dueDate: "2026-08-10", billingType: "CREDIT_CARD" };
  await processarEvento(evento("PAYMENT_CONFIRMED", { ...pay, status: "CONFIRMED" }, "2026-08-10T10:00:00Z"));
  await processarEvento(evento("PAYMENT_CHARGEBACK_REQUESTED", { ...pay, status: "CHARGEBACK_REQUESTED" }, "2026-08-20T10:00:00Z"));

  expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("SUSPENDED");
  const aviso = await prisma.notificacao.findFirstOrThrow({ where: { chave: { endsWith: ":pay_apl_4" } } });
  expect(aviso.tipo).toBe("pagamento_chargeback");
});

test("cobrança removida no Asaas vira 'cancelado' na tela", async () => {
  await alunoComAssinatura("TAPL05");
  const pay = { id: "pay_apl_5", customer: "cus_TAPL05", subscription: "sub_TAPL05", value: 129.9, dueDate: "2026-08-10" };
  await processarEvento(evento("PAYMENT_CREATED", { ...pay, status: "PENDING" }, "2026-07-31T10:00:00Z"));
  await processarEvento(evento("PAYMENT_DELETED", { ...pay, status: "PENDING", deleted: true }, "2026-08-01T10:00:00Z"));
  expect((await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: "pay_apl_5" } })).status).toBe("CANCELED");
  expect((await prisma.cobranca.findFirstOrThrow({ where: { asaasId: "pay_apl_5" } })).status).toBe("cancelado");
});

test("avulsa paga não mexe no contrato", async () => {
  const { m } = await alunoComAssinatura("TAPL06");
  await prisma.membership.update({ where: { id: m.id }, data: { status: "SUSPENDED" } });
  await processarEvento(evento("PAYMENT_RECEIVED", {
    id: "pay_apl_6", customer: "cus_TAPL06", status: "RECEIVED", value: 40, dueDate: "2026-08-10",
    billingType: "PIX", description: "Camiseta",
  }, "2026-08-10T10:00:00Z"));
  const cob = await prisma.cobranca.findFirstOrThrow({ where: { asaasId: "pay_apl_6" } });
  expect(cob.tipo).toBe("avulsa");
  expect(cob.status).toBe("pago");
  expect((await prisma.membership.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("SUSPENDED");
});

test("criação local não regride pagamento que o webhook já confirmou", async () => {
  await alunoComAssinatura("TAPL07");
  await processarEvento(evento("PAYMENT_RECEIVED", {
    id: "pay_apl_7", customer: "cus_TAPL07", subscription: "sub_TAPL07", status: "RECEIVED", value: 129.9, dueDate: "2026-08-10",
  }, "2026-08-10T10:00:00Z"));
  await upsertPaymentRepo({
    asaasPaymentId: "pay_apl_7", value: 129.9, dueDate: new Date("2026-09-01"),
    status: "PENDING", statusUpdatedAt: new Date(0),
  });
  expect((await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: "pay_apl_7" } })).status).toBe("PAID");
});

test("cliente real do Asaas não é trocado pelo id de balcão", async () => {
  const { p } = await alunoComAssinatura("TAPL08");
  await prisma.billingCustomer.update({ where: { personId: p.id }, data: { asaasCustomerId: "cus_000009999999" } });
  const bc = await upsertBillingCustomerRepo({ asaasCustomerId: `balcao_cus_${p.id}`, personId: p.id });
  expect(bc.asaasCustomerId).toBe("cus_000009999999");
});

test("renovação cancela a assinatura anterior e a mensalidade pendente dela", async () => {
  const { p, bc, bs } = await alunoComAssinatura("TAPL09");
  await processarEvento(evento("PAYMENT_CREATED", {
    id: "pay_apl_9", customer: "cus_TAPL09", subscription: "sub_TAPL09", status: "PENDING", value: 129.9, dueDate: "2026-08-10",
  }, "2026-07-31T10:00:00Z"));
  const nova = await prisma.billingSubscription.create({
    data: { asaasSubscriptionId: "sub_TAPL09_nova", customerId: bc.id, value: 149.9 },
  });

  expect(await cancelarAssinaturasAnteriores(p.id, nova.asaasSubscriptionId)).toBe(1);
  expect((await prisma.billingSubscription.findUniqueOrThrow({ where: { id: bs.id } })).status).toBe("CANCELED");
  expect((await prisma.billingSubscription.findUniqueOrThrow({ where: { id: nova.id } })).status).toBe("ACTIVE");
  expect((await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: "pay_apl_9" } })).status).toBe("CANCELED");
});

test("cobrança avulsa (modo mock) nasce pendente e pode ser cancelada", async () => {
  const { p } = await alunoComAssinatura("TAPL10");
  const venc = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const r = await gerarCobrancaAvulsaParaPessoa(p.id, { valor: 35, vencimento: venc, descricao: "Taxa de cartão de acesso" });
  const pg = await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: r.asaasPaymentId } });
  expect(pg.personId).toBe(p.id);
  expect(pg.subscriptionId).toBeNull();
  expect((await prisma.cobranca.findFirstOrThrow({ where: { asaasId: r.asaasPaymentId } })).tipo).toBe("avulsa");

  await cancelarCobranca(r.asaasPaymentId);
  expect((await prisma.payment.findUniqueOrThrow({ where: { asaasPaymentId: r.asaasPaymentId } })).status).toBe("CANCELED");
  await expect(cancelarCobranca(r.asaasPaymentId)).rejects.toThrow(/pendente ou vencida/);
});

test("cobrança avulsa recusa valor zero e vencimento no passado", async () => {
  const { p } = await alunoComAssinatura("TAPL11");
  await expect(gerarCobrancaAvulsaParaPessoa(p.id, { valor: 0, vencimento: "2030-01-01", descricao: "x" })).rejects.toThrow(/maior que zero/);
  await expect(gerarCobrancaAvulsaParaPessoa(p.id, { valor: 10, vencimento: "2020-01-01", descricao: "x" })).rejects.toThrow(/passado/);
});
