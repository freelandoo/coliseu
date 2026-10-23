import { prisma } from "@/lib/db";
import type { CobrancaStatus, CobrancaTipo, PontoMensal } from "@/lib/types";

/**
 * Cobrança com o que o fechamento financeiro precisa e a tela não usa: a data
 * em que o dinheiro entrou e como entrou.
 */
export interface CobrancaRelatorio {
  id: string;
  personId: string;
  tipo: CobrancaTipo;
  valor: number;
  vencimento: string;
  status: CobrancaStatus;
  /** Venda de balcão: dinheiro | pix | debito | credito. Nulo no Asaas. */
  metodo: string | null;
  /**
   * Quando a cobrança foi baixada. Vem do `paidAt` do Asaas quando existe —
   * é a data real do pagamento. Sem ele, sobra o `updatedAt` da cobrança, que
   * é a data da baixa no sistema: coincide com o pagamento na venda de balcão
   * (a recepção baixa no ato) e atrasa alguns minutos no webhook. Nunca é a
   * data do vencimento — competência aqui é caixa, não regime.
   */
  pagoEm: string | null;
}

export async function cobrancasRelatorioRepo(): Promise<CobrancaRelatorio[]> {
  const [cobrancas, pagamentos] = await Promise.all([
    prisma.cobranca.findMany({
      select: {
        id: true,
        personId: true,
        tipo: true,
        valor: true,
        vencimento: true,
        status: true,
        metodo: true,
        asaasId: true,
        updatedAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { paidAt: { not: null } },
      select: { asaasPaymentId: true, paidAt: true },
    }),
  ]);

  const baixaAsaas = new Map(
    pagamentos.flatMap((p) => (p.paidAt ? [[p.asaasPaymentId, p.paidAt] as const] : [])),
  );

  return cobrancas.map((c) => ({
    id: c.id,
    personId: c.personId,
    tipo: c.tipo as CobrancaTipo,
    valor: c.valor,
    vencimento: c.vencimento.toISOString(),
    status: c.status as CobrancaStatus,
    metodo: c.metodo,
    pagoEm:
      c.status === "pago"
        ? ((c.asaasId ? baixaAsaas.get(c.asaasId) : null) ?? c.updatedAt).toISOString()
        : null,
  }));
}

/**
 * Evolução mensal dos últimos `meses` meses (o atual incluso), no fuso da
 * academia. Só o que o banco sabe de verdade:
 * - matrículas: matrículas criadas no mês (`Membership.matriculadoEm`);
 * - receita: soma do que foi pago no mês (`Payment.paidAt`, status PAID) —
 *   caixa, não competência;
 * - cancelamentos: matrículas vencidas sem renovar, pelo mês do vencimento.
 *   Não existe data de cancelamento na base; é a aproximação honesta.
 * O mês corrente vem marcado como `parcial`.
 */
export async function serieMensalRepo(meses = 6): Promise<PontoMensal[]> {
  const linhas = await prisma.$queryRaw<
    { mes: Date; matriculas: number; receita: number; cancelamentos: number }[]
  >`
    with meses as (
      select generate_series(
        date_trunc('month', now() at time zone 'America/Sao_Paulo') - make_interval(months => ${meses - 1}::int),
        date_trunc('month', now() at time zone 'America/Sao_Paulo'),
        interval '1 month'
      ) as mes
    )
    select m.mes,
      (select count(*)::int from "Membership" x
        where date_trunc('month', x."matriculadoEm" at time zone 'UTC' at time zone 'America/Sao_Paulo') = m.mes) as matriculas,
      (select coalesce(sum(p.value), 0)::float from "Payment" p
        where p.status = 'PAID'
          and date_trunc('month', p."paidAt" at time zone 'UTC' at time zone 'America/Sao_Paulo') = m.mes) as receita,
      (select count(*)::int from "Membership" x
        where x.status = 'EXPIRED'
          and date_trunc('month', x."vencimentoPlano" at time zone 'UTC' at time zone 'America/Sao_Paulo') = m.mes) as cancelamentos
    from meses m order by m.mes`;
  return linhas.map((l, i) => ({
    mes: l.mes.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", ""),
    matriculas: l.matriculas,
    receita: l.receita,
    cancelamentos: l.cancelamentos,
    parcial: i === linhas.length - 1,
  }));
}
