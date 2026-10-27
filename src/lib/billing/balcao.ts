import { prisma } from "@/lib/db";
import { AsaasError, cancelarCobrancaAsaas, ehIdAsaasReal } from "@/lib/asaas";
import { aplicarPagamento } from "@/lib/billing/aplicar";
import { baixarNoAsaas, cancelarAssinaturasAnteriores } from "@/lib/billing/cobrancas";
import {
  PREFIXO_PARCELA_BALCAO,
  dividirEmParcelas,
  ehPlanoGratuito,
  mesesDoPlano,
  valorTotalDoPlano,
} from "@/lib/billing/parcelamento";
import { processarEvento } from "@/lib/billing/processor";
import {
  upsertBillingCustomerRepo,
  upsertBillingSubscriptionRepo,
  upsertPaymentRepo,
} from "@/lib/repositories/billing";

/**
 * Venda de balcão. Matrícula em plano de vários meses paga o plano inteiro
 * (semestral = mensalidade × 6, anual = × 12): a assinatura ou o boleto
 * parcelado do Asaas param de cobrar. O total pode ser dividido em até uma
 * parcela por mês de vigência: a 1ª é paga na hora e a recepção confirma as
 * outras no balcão, mês a mês. Cobrança avulsa e plano mensal pagam o valor
 * da própria cobrança.
 */

export const METODOS_BALCAO = ["dinheiro", "pix", "debito", "credito"] as const;
export type MetodoBalcao = (typeof METODOS_BALCAO)[number];

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
  /** Parcela mensal de um plano parcelado no balcão: "2 de 12". */
  parcela: { numero: number; de: number } | null;
}

const idParcela = (cobrancaId: string, k: number, n: number) => `${PREFIXO_PARCELA_BALCAO}${cobrancaId}_${k}de${n}`;

function lerParcela(asaasId: string | null): { numero: number; de: number } | null {
  const m = asaasId?.startsWith(PREFIXO_PARCELA_BALCAO) ? /_(\d+)de(\d+)$/.exec(asaasId) : null;
  return m ? { numero: Number(m[1]), de: Number(m[2]) } : null;
}

function maisMeses(d: Date, meses: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + meses);
  return r;
}

/** O que o balcão vai cobrar desta pessoa agora (null = nada em aberto). */
export async function vendaDeBalcao(personId: string): Promise<VendaBalcao | null> {
  // Plano parcelado no balcão: a próxima parcela é a mais antiga em aberto.
  const parcelaAberta = await prisma.cobranca.findFirst({
    where: { personId, status: { in: ["pendente", "atrasado"] }, asaasId: { startsWith: PREFIXO_PARCELA_BALCAO } },
    orderBy: { vencimento: "asc" },
  });
  if (parcelaAberta) {
    return {
      cobrancaId: parcelaAberta.id,
      valor: parcelaAberta.valor,
      planoInteiro: false,
      valorMensal: null,
      meses: 1,
      rotulo: null,
      parcela: lerParcela(parcelaAberta.asaasId),
    };
  }

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
    parcela: null,
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
export async function confirmarVendaBalcao(
  personId: string,
  metodo: MetodoBalcao,
  /** Plano inteiro dividido em parcelas mensais pagas no balcão (1 = à vista). */
  parcelas = 1,
): Promise<VendaBalcao & { valorPago: number; parcelas: number }> {
  const venda = await vendaDeBalcao(personId);
  if (!venda) throw new VendaBalcaoInvalida("Nenhuma cobrança pendente para esta pessoa", 404);
  const n = venda.planoInteiro ? parcelas : 1;
  if (!Number.isInteger(n) || n < 1 || n > venda.meses) {
    throw new VendaBalcaoInvalida(`Parcelas devem ir de 1 a ${venda.meses}.`, 400);
  }
  const cobranca = await prisma.cobranca.findUniqueOrThrow({ where: { id: venda.cobrancaId } });

  let paymentId: string;
  let valorPago = venda.valor;
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
    // A 1ª parcela (ou o total, à vista) é paga agora; as outras vencem uma
    // por mês e a recepção confirma cada uma no balcão.
    const valores = dividirEmParcelas(venda.valor, n);
    const agora = new Date();
    const descricao = (k: number) => (n > 1 ? `Parcela ${k} de ${n} · ${venda.rotulo ?? "plano"} no balcão` : null);
    paymentId = n > 1 ? idParcela(cobranca.id, 1, n) : `balcao_pay_${cobranca.id}`;
    valorPago = valores[0];
    await prisma.cobranca.update({
      where: { id: cobranca.id },
      data: { valor: valorPago, metodo, status: "pendente", asaasId: paymentId, assinaturaId: null, linkPagamento: null },
    });
    for (let k = 1; k <= n; k++) {
      const id = k === 1 ? paymentId : idParcela(cobranca.id, k, n);
      const vencimento = maisMeses(agora, k - 1);
      await prisma.payment.create({
        data: {
          asaasPaymentId: id,
          personId,
          value: valores[k - 1],
          dueDate: vencimento,
          status: "PENDING",
          descricao: descricao(k),
          statusUpdatedAt: new Date(0),
        },
      });
      if (k > 1) {
        await prisma.cobranca.create({
          data: { personId, tipo: "mensalidade", valor: valores[k - 1], vencimento, status: "pendente", asaasId: id },
        });
      }
    }
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
      value: valorPago,
      paymentDate: new Date().toISOString(),
    },
  });
  await prisma.payment.updateMany({
    where: { asaasPaymentId: paymentId, personId: null },
    data: { personId },
  });
  return { ...venda, valorPago, parcelas: n };
}
