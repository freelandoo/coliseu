/**
 * Plano do CloudGym → plano do Coliseu (sincronização de 26/10/2026: o
 * CloudGym é a referência de nome, preço e vigência).
 *
 * O CloudGym guarda o preço de dois jeitos, conforme quem cadastrou:
 * - por cobrança: "1 Luta Anual Recorrente" (140, months 12, duration 12) =
 *   R$ 140/mês — a regra da importação de outubro, preço × months ÷ duration;
 * - total do contrato: "CLUBE+ FULL ANUAL Outubro" (1968, 12, 12) — pela regra
 *   antiga daria R$ 1.968/mês; o certo é 1968 ÷ 12 = R$ 164.
 * Decide pela faixa: a primeira leitura que dá uma mensalidade plausível
 * vence. Nenhuma plausível: usa a regra antiga e marca para conferir.
 */
export interface PlanoCloudgym {
  id: number;
  name: string;
  price: number;
  months: number;
  duration: number;
  type: string;
}

export const MENSAL_MIN = 20;
export const MENSAL_MAX = 450;

export type LeituraPreco = "por_cobranca" | "total" | "por_parcela" | "conferir" | "diaria";

const plausivel = (v: number) => v >= MENSAL_MIN && v <= MENSAL_MAX;
const centavos = (v: number) => Math.round(v * 100) / 100;

export function mensalidadeCloudgym(p: Pick<PlanoCloudgym, "price" | "months" | "duration" | "type">): {
  valorMensal: number;
  leitura: LeituraPreco;
} {
  if (p.type === "day") return { valorMensal: centavos(p.price), leitura: "diaria" };
  const months = p.months > 0 ? p.months : 1;
  const duration = p.duration > 0 ? p.duration : 1;
  const porCobranca = (p.price * months) / duration;
  if (plausivel(porCobranca)) return { valorMensal: centavos(porCobranca), leitura: "por_cobranca" };
  const total = p.price / duration;
  if (plausivel(total)) return { valorMensal: centavos(total), leitura: "total" };
  const porParcela = p.price / months;
  if (plausivel(porParcela)) return { valorMensal: centavos(porParcela), leitura: "por_parcela" };
  return { valorMensal: centavos(porCobranca), leitura: "conferir" };
}

/** Vigência em dias, como na importação de outubro. */
export function duracaoDiasCloudgym(p: Pick<PlanoCloudgym, "duration" | "type">): number {
  if (p.type === "day") return 1;
  const meses = p.duration > 0 ? p.duration : 1;
  return ({ 12: 365, 6: 180, 3: 90, 1: 30 } as Record<number, number>)[meses] ?? meses * 30;
}
