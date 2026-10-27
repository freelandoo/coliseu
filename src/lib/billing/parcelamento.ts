/**
 * Boleto parcelado: o plano inteiro (mensalidade × meses de vigência) vira N
 * boletos mensais. Sem banco — a tela de matrícula e a rota usam a mesma conta.
 */

/** Forma de cobrança escolhida na matrícula. */
export type FormaCobranca =
  | { tipo: "assinatura" }
  | { tipo: "boleto_parcelado"; parcelas: number };

/** Plano de R$ 0 (cortesia, "FREE PASS"): não gera cobrança nem assinatura. */
export function ehPlanoGratuito(plano: { valorMensal: number }): boolean {
  return !(plano.valorMensal > 0);
}

/** Meses de vigência do plano (30 dias = 1, 90 = 3, 365 = 12). */
export function mesesDoPlano(duracaoDias: number): number {
  return Math.max(1, Math.round(duracaoDias / 30));
}

/** Valor do plano inteiro, em reais com centavos. */
export function valorTotalDoPlano(plano: { valorMensal: number; duracaoDias: number }): number {
  return Math.round(plano.valorMensal * mesesDoPlano(plano.duracaoDias) * 100) / 100;
}

/** Boleto parcelado só faz sentido em plano de mais de um mês. */
export function aceitaParcelamento(plano: { duracaoDias: number; valorMensal?: number }): boolean {
  return mesesDoPlano(plano.duracaoDias) > 1 && !(plano.valorMensal !== undefined && plano.valorMensal <= 0);
}

/** Parcelas possíveis: de 1 até um boleto por mês de vigência. */
export function opcoesDeParcelas(plano: { duracaoDias: number }): number[] {
  return Array.from({ length: mesesDoPlano(plano.duracaoDias) }, (_, i) => i + 1);
}

/** Id das parcelas mensais da venda de balcão (`balcao_parc_<cobrança>_<n>`). */
export const PREFIXO_PARCELA_BALCAO = "balcao_parc_";

/** Divide o total em N parcelas em centavos; a diferença do arredondamento vai na 1ª. */
export function dividirEmParcelas(total: number, parcelas: number): number[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / parcelas);
  return Array.from({ length: parcelas }, (_, i) => (i === 0 ? centavos - base * (parcelas - 1) : base) / 100);
}

/** Lê o que veio da tela. Devolve erro em texto quando não dá para parcelar. */
export function lerFormaCobranca(
  bruto: unknown,
  plano: { duracaoDias: number },
): { ok: true; forma: FormaCobranca } | { ok: false; erro: string } {
  if (bruto === undefined || bruto === null) return { ok: true, forma: { tipo: "assinatura" } };
  const f = bruto as { tipo?: unknown; parcelas?: unknown };
  if (f.tipo === "assinatura") return { ok: true, forma: { tipo: "assinatura" } };
  if (f.tipo !== "boleto_parcelado") return { ok: false, erro: "Forma de cobrança inválida." };
  if (!aceitaParcelamento(plano)) {
    return { ok: false, erro: "Plano de um mês não parcela — use a assinatura mensal." };
  }
  const parcelas = Number(f.parcelas);
  if (!Number.isInteger(parcelas) || !opcoesDeParcelas(plano).includes(parcelas)) {
    return { ok: false, erro: `Parcelas devem ir de 1 a ${mesesDoPlano(plano.duracaoDias)}.` };
  }
  return { ok: true, forma: { tipo: "boleto_parcelado", parcelas } };
}
