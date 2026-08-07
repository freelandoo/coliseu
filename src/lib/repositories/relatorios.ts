import { prisma } from "@/lib/db";
import type { CobrancaStatus, CobrancaTipo } from "@/lib/types";

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
