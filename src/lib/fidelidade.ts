import { diasEntre } from "@/lib/mock-data";
import type { Aluno } from "@/lib/types";

/** Meses (arredondados) desde uma data ISO até hoje. */
export const mesesDesde = (iso: string) => Math.max(0, Math.round(diasEntre(iso) / 30));

/** Duração legível a partir de um total de meses. */
export function formatMeses(m: number): string {
  const meses = Math.round(m);
  if (meses < 1) return "menos de 1 mês";
  if (meses === 1) return "1 mês";
  if (meses < 12) return `${meses} meses`;
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const anosStr = `${anos} ano${anos > 1 ? "s" : ""}`;
  return resto ? `${anosStr} e ${resto} ${resto > 1 ? "meses" : "mês"}` : anosStr;
}

/** Tempo de casa de um aluno ativo, em meses. */
export const mesesDeCasa = (a: Aluno) => mesesDesde(a.matriculadoEm);

/** Meses que o aluno ficou ativo antes de parar de vir (matrícula → última presença). */
export function mesesAteSair(a: Aluno): number {
  const dias = diasEntre(a.matriculadoEm) - diasEntre(a.ultimaPresenca); // = últimaPresença − matrícula
  return Math.max(0, Math.round(dias / 30));
}

export type FaixaFidelidade = "novato" | "firmando" | "fiel" | "veterano";

export const FAIXA_LABEL: Record<FaixaFidelidade, string> = {
  novato: "Novato",
  firmando: "Firmando",
  fiel: "Fiel",
  veterano: "Veterano",
};

export function faixaFidelidade(meses: number): FaixaFidelidade {
  if (meses >= 12) return "veterano";
  if (meses >= 6) return "fiel";
  if (meses >= 3) return "firmando";
  return "novato";
}

/** Faixas de tempo para distribuições (evasão, coorte). */
export const FAIXAS_TEMPO = [
  { key: "0-1", label: "até 1 mês", min: 0, max: 1 },
  { key: "1-3", label: "1–3 meses", min: 1, max: 3 },
  { key: "3-6", label: "3–6 meses", min: 3, max: 6 },
  { key: "6-12", label: "6–12 meses", min: 6, max: 12 },
  { key: "12+", label: "12+ meses", min: 12, max: Infinity },
] as const;

function indiceFaixa(meses: number): number {
  const i = FAIXAS_TEMPO.findIndex((f) => meses >= f.min && meses < f.max);
  return i < 0 ? FAIXAS_TEMPO.length - 1 : i;
}

const ativosDe = (alunos: Aluno[]) => alunos.filter((a) => a.status !== "cancelado");
const canceladosDe = (alunos: Aluno[]) => alunos.filter((a) => a.status === "cancelado");

/** #1 — Ponto de evasão: em que tempo de casa os alunos mais cancelam. */
export function pontoDeEvasao(alunos: Aluno[]) {
  const cancelados = canceladosDe(alunos);
  const dist = FAIXAS_TEMPO.map((f) => ({ label: f.label, count: 0 }));
  for (const a of cancelados) dist[indiceFaixa(mesesAteSair(a))].count += 1;
  const media = cancelados.length
    ? Math.round(cancelados.reduce((s, a) => s + mesesAteSair(a), 0) / cancelados.length)
    : 0;
  const pico = dist.reduce((mx, d) => (d.count > mx.count ? d : mx), dist[0]);
  return { dist, mediaMeses: media, pico, total: cancelados.length };
}

/** #2 — Curva de retenção por coorte: % ainda ativo por tempo desde a matrícula. */
export function retencaoPorCoorte(alunos: Aluno[]) {
  return FAIXAS_TEMPO.map((f) => {
    const coorte = alunos.filter((a) => {
      const m = mesesDesde(a.matriculadoEm);
      return m >= f.min && m < f.max;
    });
    const ativos = coorte.filter((a) => a.status !== "cancelado").length;
    return {
      label: f.label,
      total: coorte.length,
      ativos,
      pct: coorte.length ? (ativos / coorte.length) * 100 : 0,
    };
  });
}

/** #3 — Mix de fidelidade da base ativa. */
export function mixFidelidade(alunos: Aluno[]) {
  const ativos = ativosDe(alunos);
  const faixas: FaixaFidelidade[] = ["novato", "firmando", "fiel", "veterano"];
  return faixas.map((k) => {
    const count = ativos.filter((a) => faixaFidelidade(mesesDeCasa(a)) === k).length;
    return { faixa: k, label: FAIXA_LABEL[k], count, pct: ativos.length ? (count / ativos.length) * 100 : 0 };
  });
}

/** #4 — Fiéis e veteranos (6+ meses) que estão ausentes (7+ dias). Alto valor em risco. */
export function altoValorEmRisco(alunos: Aluno[]) {
  return ativosDe(alunos)
    .map((a) => ({ aluno: a, meses: mesesDeCasa(a), diasAusente: Math.max(0, diasEntre(a.ultimaPresenca)) }))
    .filter((x) => x.meses >= 6 && x.diasAusente >= 7)
    .sort((x, y) => y.meses - x.meses || y.diasAusente - x.diasAusente);
}

/** #5 — Janela de reativação: cancelados por tempo desde a saída. */
export function janelaReativacao(alunos: Aluno[]) {
  const cancelados = canceladosDe(alunos).map((a) => ({ aluno: a, meses: mesesDesde(a.ultimaPresenca) }));
  return {
    recentes: cancelados.filter((c) => c.meses < 2), // fácil win-back
    mornos: cancelados.filter((c) => c.meses >= 2 && c.meses < 6),
    frios: cancelados.filter((c) => c.meses >= 6),
    total: cancelados.length,
  };
}

/** #6 — LTV médio = ticket médio × vida média (meses). */
export function ltvMedio(alunos: Aluno[], valorMensal: (planoId: string) => number) {
  const ativos = ativosDe(alunos);
  const cancelados = canceladosDe(alunos);
  const ticketMedio = ativos.length
    ? ativos.reduce((s, a) => s + valorMensal(a.planoId), 0) / ativos.length
    : 0;
  // Vida média: usa os ciclos já concluídos (cancelados); sem eles, cai no tempo de casa dos ativos.
  const vidaMediaMeses = cancelados.length
    ? cancelados.reduce((s, a) => s + mesesAteSair(a), 0) / cancelados.length
    : ativos.length
      ? ativos.reduce((s, a) => s + mesesDeCasa(a), 0) / ativos.length
      : 0;
  const baseadoEm: "cancelados" | "ativos" = cancelados.length ? "cancelados" : "ativos";
  return { ticketMedio, vidaMediaMeses, ltv: ticketMedio * vidaMediaMeses, baseadoEm };
}

/** #7 — Churn mensal estimado (saídas no último mês ÷ base do início do período). */
export function churnEstimado(alunos: Aluno[]) {
  const ativos = ativosDe(alunos).length;
  const saiuUltimoMes = canceladosDe(alunos).filter((a) => mesesDesde(a.ultimaPresenca) <= 1).length;
  const baseInicio = ativos + saiuUltimoMes;
  const mensalPct = baseInicio ? (saiuUltimoMes / baseInicio) * 100 : 0;
  const anualPct = (1 - Math.pow(1 - mensalPct / 100, 12)) * 100;
  return { mensalPct, anualPct, saiuUltimoMes, baseInicio };
}
