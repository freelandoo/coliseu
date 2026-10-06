import { Prisma } from "@prisma/client";
import type { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AsaasPaymentLike } from "@/lib/asaas";
import { cobrancaStatusDe, sincronizarMembership } from "@/lib/billing/apply";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { notificarAdmins, type TipoNotificacao } from "@/lib/notificacoes";

/**
 * Caminho único para gravar o estado de uma cobrança do Asaas — webhook,
 * reconciliação e balcão passam por aqui.
 *
 * Liga a cobrança ao aluno pela assinatura ou pelo cliente: as mensalidades
 * recorrentes nascem no Asaas, sem passar pela tela, e sem esse vínculo a
 * política de acesso não as enxergaria.
 *
 * A conta do Asaas pode ser compartilhada com outro sistema: cobrança de
 * cliente que o Coliseu não criou é ignorada, nunca importada.
 */

export type PagamentoAsaas = Partial<Omit<AsaasPaymentLike, "id">> & { id: string };

export function statusDoAsaas(s: string | null | undefined): PaymentStatus {
  switch (s) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH": return "PAID";
    case "OVERDUE": return "OVERDUE";
    case "REFUNDED": return "REFUNDED";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL": return "CHARGEBACK";
    case "DELETED": return "CANCELED";
    default: return "PENDING";
  }
}

const NOMES_FORMA: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "boleto",
  CREDIT_CARD: "cartão de crédito",
  DEBIT_CARD: "cartão de débito",
};
const NOMES_BALCAO: Record<string, string> = {
  dinheiro: "dinheiro no balcão",
  pix: "PIX no balcão",
  debito: "débito no balcão",
  credito: "crédito no balcão",
};
export function nomeDaForma(billingType: string | null | undefined): string | null {
  if (!billingType) return null;
  if (billingType.startsWith("BALCAO:")) return NOMES_BALCAO[billingType.slice(7)] ?? "balcão";
  return NOMES_FORMA[billingType] ?? null;
}

export interface ResultadoAplicacao {
  ignorado: boolean;
  criado: boolean;
  aplicado: boolean;
  personId: string | null;
  statusAnterior: PaymentStatus | null;
}

function dataAsaas(d: string | null | undefined): Date | null {
  return d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : null;
}

export async function aplicarPagamento(
  p: PagamentoAsaas,
  status: PaymentStatus,
  eventAt: Date,
): Promise<ResultadoAplicacao> {
  const dueDate = dataAsaas(p.dueDate);
  const billingType = p.billingType && p.billingType !== "UNDEFINED" ? p.billingType : undefined;

  const r = await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({
      where: { asaasPaymentId: p.id },
      include: { subscription: { select: { customer: { select: { personId: true } } } } },
    });

    // Vínculos: assinatura local → cliente → pessoa; ou cliente direto; ou a
    // Cobranca que a tela criou com o mesmo id.
    const sub = p.subscription
      ? await tx.billingSubscription.findUnique({
          where: { asaasSubscriptionId: p.subscription },
          select: { id: true, customer: { select: { personId: true } } },
        })
      : null;
    const cliente = !sub && p.customer
      ? await tx.billingCustomer.findUnique({ where: { asaasCustomerId: p.customer }, select: { personId: true } })
      : null;
    const cob = await tx.cobranca.findFirst({ where: { asaasId: p.id } });
    const personId =
      existing?.personId ??
      existing?.subscription?.customer.personId ??
      sub?.customer.personId ??
      cliente?.personId ??
      cob?.personId ??
      null;
    const subscriptionId = existing?.subscriptionId ?? sub?.id ?? null;

    if (!existing && !personId) {
      return { ignorado: true, criado: false, aplicado: false, personId: null, statusAnterior: null };
    }

    const paidAt = status === "PAID" ? (dataAsaas(p.paymentDate) ?? eventAt) : null;
    let criado = false;
    let aplicado = false;

    if (!existing) {
      try {
        await tx.payment.create({
          data: {
            asaasPaymentId: p.id,
            subscriptionId,
            personId,
            billingType: billingType ?? "UNDEFINED",
            descricao: p.description ?? null,
            externalReference: p.externalReference ?? null,
            value: p.value ?? 0,
            dueDate: dueDate ?? eventAt,
            status,
            paidAt,
            invoiceUrl: p.invoiceUrl ?? null,
            statusUpdatedAt: eventAt,
          },
        });
        criado = aplicado = true;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        // Criação concorrente já inseriu — cai no update condicional abaixo.
      }
    }

    if (!criado) {
      // Status só avança com evento mais novo (webhook fora de ordem não regride).
      const res = await tx.payment.updateMany({
        where: { asaasPaymentId: p.id, statusUpdatedAt: { lt: eventAt } },
        data: {
          status,
          paidAt,
          statusUpdatedAt: eventAt,
          ...(p.value !== undefined && { value: p.value }),
          ...(dueDate && { dueDate }),
        },
      });
      aplicado = res.count > 0;
      // Vínculos e forma escolhida não dependem de ordem: completa o que faltar.
      await tx.payment.update({
        where: { asaasPaymentId: p.id },
        data: {
          ...(billingType && { billingType }),
          ...(!existing?.personId && personId && { personId }),
          ...(!existing?.subscriptionId && subscriptionId && { subscriptionId }),
          ...(p.invoiceUrl && { invoiceUrl: p.invoiceUrl }),
          ...(p.description && !existing?.descricao && { descricao: p.description }),
        },
      });
    }

    if (aplicado && personId) {
      // Projeção na Cobranca (tela de Cobrança): mensalidade recorrente nasce aqui.
      const ehMensalidade = Boolean(subscriptionId) || (cob ? cob.tipo !== "avulsa" : false);
      if (cob) {
        await tx.cobranca.update({ where: { id: cob.id }, data: { status: cobrancaStatusDe(status) } });
      } else if (status !== "CANCELED") {
        await tx.cobranca.create({
          data: {
            personId,
            tipo: ehMensalidade ? "mensalidade" : "avulsa",
            valor: p.value ?? 0,
            vencimento: dueDate ?? eventAt,
            status: cobrancaStatusDe(status),
            asaasId: p.id,
            assinaturaId: p.subscription ?? null,
            linkPagamento: p.invoiceUrl ?? null,
          },
        });
      }
      if (ehMensalidade) await sincronizarMembership(tx, personId, status, dueDate);
    }

    return {
      ignorado: false,
      criado,
      aplicado,
      personId,
      statusAnterior: existing?.status ?? null,
    };
  });

  if (r.aplicado && r.personId) {
    try {
      await recalcularAcessoDePessoa(r.personId);
    } catch (e) {
      console.error("[outbox] falha ao recalcular acesso:", e);
    }
    // Transição de status (reentrega/reconciliação do mesmo status não avisa).
    const aviso = AVISO_POR_STATUS[status];
    if (aviso && r.statusAnterior !== status) {
      await avisarPagamento(p.id, aviso, r.personId).catch((e) =>
        console.error("[notificacoes] falha ao avisar:", e),
      );
    }
  }
  return r;
}

type Aviso = "recebido" | "vencido" | "estornado" | "chargeback" | "parcial";

const AVISO_POR_STATUS: Partial<Record<PaymentStatus, Aviso>> = {
  PAID: "recebido",
  OVERDUE: "vencido",
  REFUNDED: "estornado",
  CHARGEBACK: "chargeback",
};

const TEXTO_AVISO: Record<Aviso, { tipo: TipoNotificacao; titulo: string; oQue: string; acesso: boolean }> = {
  recebido: { tipo: "pagamento_recebido", titulo: "Pagamento recebido", oQue: "foi pago", acesso: false },
  vencido: { tipo: "pagamento_vencido", titulo: "Pagamento vencido", oQue: "venceu sem pagamento", acesso: false },
  estornado: { tipo: "pagamento_estornado", titulo: "Estorno", oQue: "foi estornado", acesso: true },
  chargeback: { tipo: "pagamento_chargeback", titulo: "Chargeback", oQue: "foi contestado no cartão (chargeback)", acesso: true },
  parcial: { tipo: "pagamento_estornado", titulo: "Estorno parcial", oQue: "teve estorno parcial", acesso: false },
};

/**
 * Aviso para os admins sobre uma cobrança. Lê valor/forma do que está gravado
 * (o corpo do webhook de vencimento, por exemplo, não traz a forma escolhida).
 */
export async function avisarPagamento(asaasPaymentId: string, aviso: Aviso, personId: string): Promise<void> {
  const [pessoa, pg] = await Promise.all([
    prisma.person.findUnique({ where: { id: personId }, select: { nome: true } }),
    prisma.payment.findUnique({
      where: { asaasPaymentId },
      select: { value: true, billingType: true, dueDate: true, descricao: true },
    }),
  ]);
  const t = TEXTO_AVISO[aviso];
  const valor = (pg?.value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const forma = nomeDaForma(pg?.billingType);
  const venc = pg?.dueDate ? ` (venc. ${pg.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })})` : "";
  await notificarAdmins({
    tipo: t.tipo,
    titulo: `${t.titulo}: ${pessoa?.nome ?? "Aluno"}`,
    corpo:
      `${pg?.descricao ?? "Cobrança"} de ${valor}${venc}${forma ? ` via ${forma}` : ""} ${t.oQue}.` +
      (t.acesso ? " O acesso na catraca foi reavaliado." : ""),
    url: `/matriculados/${personId}`,
    chave: `${t.tipo}:${aviso}:${asaasPaymentId}`,
  });
}
