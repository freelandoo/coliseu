import { prisma } from "@/lib/db";
import {
  asaasConfigurado,
  cancelarAssinaturaAsaas,
  cancelarCobrancaAsaas,
  criarCobrancaAvulsa,
  criarOuLocalizarCliente,
  ehIdAsaasReal,
  receberEmDinheiroAsaas,
} from "@/lib/asaas";
import { aplicarPagamento } from "@/lib/billing/aplicar";
import { upsertBillingCustomerRepo } from "@/lib/repositories/billing";

/**
 * Operações de cobrança que juntam Asaas + banco. A regra comum: primeiro o
 * Asaas (se falhar, nada muda aqui), depois o estado local pelo mesmo
 * caminho do webhook (`aplicarPagamento`).
 */

export class CobrancaInvalida extends Error {}

/** Cliente do Asaas da pessoa: reaproveita o que já existe, cria se preciso. */
export async function garantirClienteAsaas(personId: string): Promise<string> {
  const bc = await prisma.billingCustomer.findUnique({ where: { personId } });
  if (bc && (ehIdAsaasReal(bc.asaasCustomerId) || !asaasConfigurado())) return bc.asaasCustomerId;

  const p = await prisma.person.findUniqueOrThrow({ where: { id: personId } });
  const cpf = (p.cpf ?? "").replace(/\D/g, "");
  if (asaasConfigurado() && cpf.length !== 11 && cpf.length !== 14) {
    throw new CobrancaInvalida("Cadastre o CPF do aluno antes de gerar cobrança no Asaas.");
  }
  const cliente = await criarOuLocalizarCliente({
    name: p.nome,
    mobilePhone: (p.telefone ?? "").replace(/\D/g, ""),
    email: p.email || undefined,
    cpfCnpj: cpf || undefined,
    externalReference: personId,
  });
  await upsertBillingCustomerRepo({ asaasCustomerId: cliente.id, personId, externalReference: personId });
  return cliente.id;
}

/**
 * Renovação/troca de plano: a assinatura nova já foi criada — as anteriores
 * param de cobrar. Sem isso o aluno pagaria duas mensalidades por mês.
 */
export async function cancelarAssinaturasAnteriores(personId: string, manterAsaasId?: string): Promise<number> {
  const antigas = await prisma.billingSubscription.findMany({
    where: {
      customer: { personId },
      status: "ACTIVE",
      ...(manterAsaasId && { asaasSubscriptionId: { not: manterAsaasId } }),
    },
  });
  for (const s of antigas) {
    await cancelarAssinaturaAsaas(s.asaasSubscriptionId);
    await prisma.billingSubscription.update({ where: { id: s.id }, data: { status: "CANCELED" } });
    // Mensalidade ainda não vencida da assinatura antiga deixa de existir
    // (o Asaas as remove junto; aqui não espera o webhook).
    const pendentes = await prisma.payment.findMany({
      where: { subscriptionId: s.id, status: "PENDING" },
    });
    for (const pg of pendentes) {
      await aplicarPagamento({ id: pg.asaasPaymentId }, "CANCELED", new Date());
    }
  }
  return antigas.length;
}

/** "Cancelar assinatura" na ficha: para as cobranças futuras. O contrato segue até o vencimento. */
export async function cancelarAssinaturaDaPessoa(personId: string): Promise<number> {
  return cancelarAssinaturasAnteriores(personId);
}

export async function gerarCobrancaAvulsaParaPessoa(
  personId: string,
  input: { valor: number; vencimento: string; descricao: string },
): Promise<{ asaasPaymentId: string; linkPagamento: string }> {
  if (!(input.valor > 0)) throw new CobrancaInvalida("Valor precisa ser maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vencimento)) throw new CobrancaInvalida("Vencimento inválido.");
  if (input.vencimento < new Date().toISOString().slice(0, 10)) {
    throw new CobrancaInvalida("Vencimento não pode ser no passado.");
  }
  const descricao = input.descricao.trim();
  if (!descricao) throw new CobrancaInvalida("Descreva a cobrança (aparece para o aluno).");

  const customer = await garantirClienteAsaas(personId);
  const c = await criarCobrancaAvulsa({
    customer,
    value: Math.round(input.valor * 100) / 100,
    dueDate: input.vencimento,
    description: descricao,
    externalReference: personId,
  });
  // Grava já ligada à pessoa — o webhook PAYMENT_CREATED pode chegar antes ou depois.
  await prisma.payment.upsert({
    where: { asaasPaymentId: c.id },
    create: {
      asaasPaymentId: c.id,
      personId,
      descricao,
      value: c.value,
      dueDate: new Date(`${c.dueDate}T12:00:00Z`),
      status: "PENDING",
      invoiceUrl: c.invoiceUrl,
      statusUpdatedAt: new Date(0),
    },
    update: { personId, descricao },
  });
  const ja = await prisma.cobranca.findFirst({ where: { asaasId: c.id } });
  if (!ja) {
    await prisma.cobranca.create({
      data: {
        personId,
        tipo: "avulsa",
        valor: c.value,
        vencimento: new Date(`${c.dueDate}T12:00:00Z`),
        status: "pendente",
        asaasId: c.id,
        linkPagamento: c.invoiceUrl,
      },
    });
  }
  return { asaasPaymentId: c.id, linkPagamento: c.invoiceUrl };
}

/** Cancela uma cobrança ainda não paga (no Asaas e aqui). */
export async function cancelarCobranca(asaasPaymentId: string): Promise<void> {
  const pg = await prisma.payment.findUnique({ where: { asaasPaymentId } });
  if (!pg) throw new CobrancaInvalida("Cobrança não encontrada.");
  if (pg.status !== "PENDING" && pg.status !== "OVERDUE") {
    throw new CobrancaInvalida("Só dá para cancelar cobrança pendente ou vencida.");
  }
  await cancelarCobrancaAsaas(asaasPaymentId);
  await aplicarPagamento({ id: asaasPaymentId }, "CANCELED", new Date());
}

/**
 * Venda de balcão sobre cobrança que existe no Asaas: dá baixa lá antes de
 * marcar pago aqui — senão o Asaas segue cobrando e lembrando o aluno.
 */
export async function baixarNoAsaas(asaasPaymentId: string, valor: number): Promise<void> {
  await receberEmDinheiroAsaas(asaasPaymentId, valor);
}

export interface PagamentoDaPessoa {
  id: string;
  asaasPaymentId: string;
  valor: number;
  vencimento: string;
  status: string;
  forma: string;
  pagoEm: string | null;
  link: string | null;
  descricao: string | null;
  recorrente: boolean;
}

export async function listarPagamentosDaPessoa(personId: string): Promise<{
  pagamentos: PagamentoDaPessoa[];
  assinatura: { valor: number; status: string; asaasId: string } | null;
}> {
  const [pagamentos, assinatura] = await Promise.all([
    prisma.payment.findMany({
      where: { OR: [{ personId }, { subscription: { customer: { personId } } }] },
      orderBy: { dueDate: "desc" },
      take: 36,
    }),
    prisma.billingSubscription.findFirst({
      where: { customer: { personId }, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    pagamentos: pagamentos.map((p) => ({
      id: p.id,
      asaasPaymentId: p.asaasPaymentId,
      valor: p.value,
      vencimento: p.dueDate.toISOString(),
      status: p.status,
      forma: p.billingType, // PIX | BOLETO | CREDIT_CARD | UNDEFINED | BALCAO:<método>
      pagoEm: p.paidAt?.toISOString() ?? null,
      link: p.invoiceUrl,
      descricao: p.descricao,
      recorrente: Boolean(p.subscriptionId),
    })),
    assinatura: assinatura
      ? { valor: assinatura.value, status: assinatura.status, asaasId: assinatura.asaasSubscriptionId }
      : null,
  };
}
