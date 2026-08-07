/**
 * O mês desenhado como grade — a parte do calendário que não tem pixel.
 *
 * Toda conta de dia é feita em UTC (`Date.UTC` + soma de 24h) e o resultado sai
 * como texto "AAAA-MM-DD", igual ao resto da aula experimental. Usar o `Date`
 * do aparelho aqui traria de volta o problema que a agenda já resolveu: o
 * servidor roda em UTC e a recepção em São Paulo, e a virada do horário de
 * verão faria "somar um dia" cair no mesmo dia de novo.
 */

import { dataISO } from "@/lib/aula-experimental";

const DIA_MS = 86_400_000;

/** Cabeçalho da grade, começando no domingo (como o calendário do celular). */
export const INICIAIS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export interface DiaGrade {
  /** "AAAA-MM-DD" */
  data: string;
  /** Número que aparece na célula. */
  dia: number;
  /** `false` nas sobras do mês vizinho que completam a primeira/última semana. */
  doMes: boolean;
}

/** Quantos dias tem o mês (mês de 1 a 12). Dia 0 do seguinte é o último deste. */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * A grade do mês em semanas inteiras de domingo a sábado.
 *
 * Os dias vizinhos vêm junto (marcados com `doMes: false`) em vez de virarem
 * buraco: a semana que atravessa a virada do mês continua sendo uma semana, e
 * uma aula marcada no dia 1º aparece para quem ainda está olhando o mês
 * anterior.
 */
export function gradeDoMes(ano: number, mes: number): DiaGrade[] {
  const diaDaSemanaDo1 = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  // Recua até o domingo que abre a semana do dia 1º.
  const inicio = Date.UTC(ano, mes - 1, 1 - diaDaSemanaDo1);
  const celulas = semanasDoMes(ano, mes) * 7;

  return Array.from({ length: celulas }, (_, i) => {
    const t = new Date(inicio + i * DIA_MS);
    const m = t.getUTCMonth() + 1;
    return {
      data: dataISO(t.getUTCFullYear(), m, t.getUTCDate()),
      dia: t.getUTCDate(),
      doMes: m === mes && t.getUTCFullYear() === ano,
    };
  });
}

/** Linhas que a grade ocupa — 4 (fevereiro cheio) a 6. O GSAP usa para o stagger. */
export function semanasDoMes(ano: number, mes: number): number {
  const diaDaSemanaDo1 = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  return Math.ceil((diaDaSemanaDo1 + diasNoMes(ano, mes)) / 7);
}

/** Anda `passo` meses (negativo volta), virando o ano quando precisa. */
export function mesDeslocado(
  ano: number,
  mes: number,
  passo: number,
): { ano: number; mes: number } {
  const t = new Date(Date.UTC(ano, mes - 1 + passo, 1));
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1 };
}

/** Em que mês cai uma data "AAAA-MM-DD". */
export function mesDaData(data: string): { ano: number; mes: number } {
  const [ano, mes] = data.split("-").map(Number);
  return { ano, mes };
}

/** "Agosto 2026" — o título em cima da grade. */
export function rotuloMes(ano: number, mes: number): string {
  return `${NOMES_MES[mes - 1]} ${ano}`;
}

/**
 * Junta por dia o que estiver agendado. É o mapa que pinta a grade de vermelho
 * e monta a lista de baixo, então vale para qualquer item com `data`.
 */
export function agruparPorData<T extends { data: string }>(itens: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const doDia = mapa.get(item.data);
    if (doDia) doDia.push(item);
    else mapa.set(item.data, [item]);
  }
  return mapa;
}
