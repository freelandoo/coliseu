import { prisma } from "@/lib/db";
import { AsaasError, cancelarCobrancaAsaas, ehIdAsaasReal } from "@/lib/asaas";
import { aplicarPagamento } from "@/lib/billing/aplicar";
import { baixarNoAsaas, cancelarAssinaturasAnteriores } from "@/lib/billing/cobrancas";
import { ehPlanoGratuito, mesesDoPlano, valorTotalDoPlano } from "@/lib/billing/parcelamento";
import { processarEvento } from "@/lib/billing/processor";
import {
  upsertBillingCustomerRepo,
  upsertBillingSubscriptionRepo,
  upsertPaymentRepo,
} from "@/lib/repositories/billing";

/**
 * Venda de balcão. Matrícula em plano de vários meses paga o plano inteiro
 * (semestral = mensalidade × 6, anual = × 12): a assinatura ou o boleto
 * parcelado do Asaas param de cobrar. O parcelamento, se houver, fica na
 * maquininha. Cobrança avulsa e plano mensal pagam o valor da própria cobrança.
 */

export const METODOS_BALCAO = ["dinheiro", "pix", "debito", "credito"] as const;
export type MetodoBalcao = (typeof METODOS_BALCAO)[number];

/** Até quantas vezes a maquininha parcela no crédito. */
export const MAX_PARCELAS_CARTAO = 12;

export function rotuloDaDuracao(duracaoDias: number): string {
  const meses = mesesDoPlano(duracaoDias);
  if (meses === 1) return "Mensal";
  if (meses === 3) return "Trimestral";
  if (meses === 6) return "Semestral";
  if (meses === 12) return "Anual";
  return `${meses} meses`;
}

export interface VendaBalcao {
  cobrancaId: string;
  valor: number;
  /** true = cobra o plano inteiro (mensalidade × meses) no lugar da cobrança aberta. */
  planoInteiro: boolean;
  valorMensal: number | null;
  meses: number;
  rotulo: string | null;
}

/** O que o balcão vai cobrar desta pessoa agora (null = nada em aberto). */
export async function vendaDeBalcao(personId: string): Promise<VendaBalcao | null> {
  const cobranca = await prisma.cobranca.findFirst({
    where: { personId, status: "pendente" },
    orderBy: { vencimento: "desc" },
  });
  if (!cobranca) return null;
  const base: VendaBalcao = {
    cobrancaId: cobranca.id,
    valor: cobranca.valor,
    planoInteiro: false,
    valorMensal: null,
    meses: 1,
    rotulo: null,
  };
  if (cobranca.tipo !== "matricula") return base;

  const m = await prisma.membership.findFirst({
    where: { personId },
    orderBy: { matriculadoEm: "desc" },
    include: { plan: true },
  });
  if (!m || ehPlanoGratuito(m.plan)) return base;
  const meses = mesesDoPlano(m.plan.duracaoDias);
  const venda = { ...base, valorMensal: m.plan.valorMensal, meses, rotulo: rotuloDaDuracao(m.plan.duracaoDias) };
  if (meses === 1) return venda;
  return { ...venda, valor: valorTotalDoPlano(m.plan), planoInteiro: true };
}

export class VendaBalcaoInvalida extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Confirma o pagamento presencial. O Asaas vem primeiro (se recusar, nada
 * muda aqui); o estado local segue o mesmo caminho do webhook.
 */
export async function confirmarVendaBalcao(personId: string, metodo: MetodoBalcao): Promise<VendaBalcao> {
  const venda = await vendaDeBalcao(personId);
  if (!venda) throw new VendaBalcaoInvalida("Nenhuma cobrança pendente para esta pessoa", 404);
  const cobranca = await prisma.cobranca.findUniqueOrThrow({ where: { id: venda.cobrancaId } });

  let paymentId: string;
  if (venda.planoInteiro) {
    // O plano inteiro foi pago aqui: a cobrança aberta e a assinatura (ou o
    // parcelamento) deixam de existir no Asaas — senão ele cobraria de novo.
    if (ehIdAsaasReal(cobranca.asaasId)) {
      try {
        await cancelarCobrancaAsaas(cobranca.asaasId);
      } catch (e) {
        if (!(e instanceof AsaasError && e.status === 404)) throw e;
      }
    }
    await cancelarAssinaturasAnteriores(personId);
    if (cobranca.asaasId) {
      const pg = await prisma.payment.findUnique({ where: { asaasPaymentId: cobranca.asaasId } });
      if (pg && (pg.status === "PENDING" || pg.status === "OVERDUE")) {
        await aplicarPagamento({ id: pg.asaasPaymentId }, "CANCELED", new Date());
      }
    }
    paymentId = `balcao_pay_${cobranca.id}`;
    await prisma.cobranca.update({
      where: { id: cobranca.id },
      data: { valor: venda.valor, metodo, status: "pendente", asaasId: paymentId, assinaturaId: null, linkPagamento: null },
    });
    await upsertPaymentRepo({
      asaasPaymentId: paymentId,
      personId,
      value: venda.valor,
      dueDate: new Date(),
      status: "PENDING",
      statusUpdatedAt: new Date(0),
    });
  } else {
    // Cobrança que existe no Asaas: dá baixa lá primeiro — senão o aluno
    // seguiria recebendo cobrança já paga.
    if (ehIdAsaasReal(cobranca.asaasId)) await baixarNoAsaas(cobranca.asaasId, cobranca.valor);
    await prisma.cobranca.update({ where: { id: cobranca.id }, data: { metodo } });
    if (cobranca.asaasId) {
      paymentId = cobranca.asaasId;
    } else {
      // Cobrança sem vínculo no Asaas (ex.: dados de seed): cadeia local
      // (customer → subscription → payment) para a política de acesso
      // enxergar o pagamento e o balcão liberar a catraca.
      const membership = await prisma.membership.findFirst({
        where: { personId },
        orderBy: { matriculadoEm: "desc" },
      });
      paymentId = `balcao_pay_${cobranca.id}`;
      const bc = await upsertBillingCustomerRepo({ asaasCustomerId: `balcao_cus_${personId}`, personId });
      const bs = await upsertBillingSubscriptionRepo({
        asaasSubscriptionId: `balcao_sub_${cobranca.id}`,
        customerId: bc.id,
        value: cobranca.valor,
        externalReference: membership?.id ?? null,
      });
      await upsertPaymentRepo({
        asaasPaymentId: paymentId,
        subscriptionId: bs.id,
        value: cobranca.valor,
        dueDate: cobranca.vencimento,
        status: "PENDING",
        statusUpdatedAt: new Date(),
      });
      await prisma.cobranca.update({ where: { id: cobranca.id }, data: { asaasId: paymentId } });
    }
  }

  // Caminho do webhook: marca o Payment PAID, ativa a matrícula e libera o acesso.
  await processarEvento({
    id: `balcao:${paymentId}:${Date.now()}`,
    event: "PAYMENT_RECEIVED",
    dateCreated: new Date().toISOString(),
    payment: {
      id: paymentId,
      status: "RECEIVED",
      billingType: `BALCAO:${metodo}`,
      value: venda.valor,
      paymentDate: new Date().toISOString(),
    },
  });
  await prisma.payment.updateMany({
    where: { asaasPaymentId: paymentId, personId: null },
    data: { personId },
  });
  return venda;
}
