/**
 * Recorte de tempo dos relatórios exportáveis.
 *
 * Todo relatório sai de um período fechado ("Julho 2026", "01/05 a 30/06"):
 * exportar "tudo" não responde à pergunta que o dono faz, que é sempre
 * comparativa — quanto entrou este mês, quanto custou trazer aluno neste mês.
 *
 * As bordas são calculadas no relógio da academia (UTC−3; o Brasil não tem
 * horário de verão desde 2019) e não no do servidor. Um pagamento das 21h de
 * 31/07 é gravado como 01/08 em UTC — sem o ajuste ele cairia no fechamento do
 * mês errado, e o fechamento é justamente o número que ninguém confere duas
 * vezes.
 */

import { dataISO, ehDataISO } from "@/lib/aula-experimental";
import { NOMES_MES, diasNoMes, mesDaData, mesDeslocado } from "@/lib/calendario";

/** Fuso da academia. Fixo de propósito — ver o cabeçalho. */
const OFFSET = "-03:00";
const OFFSET_MS = 3 * 3_600_000;
const DIA_MS = 86_400_000;

export type PresetPeriodo =
  | "mes-atual"
  | "mes-anterior"
  | "ultimos-3-meses"
  | "ultimos-12-meses"
  | "personalizado";

export const PRESET_LABEL: Record<PresetPeriodo, string> = {
  "mes-atual": "Mês atual",
  "mes-anterior": "Mês anterior",
  "ultimos-3-meses": "Últimos 3 meses",
  "ultimos-12-meses": "Últimos 12 meses",
  personalizado: "Personalizado",
};

export const PRESETS: PresetPeriodo[] = [
  "mes-atual",
  "mes-anterior",
  "ultimos-3-meses",
  "ultimos-12-meses",
  "personalizado",
];

export function ehPreset(v: unknown): v is PresetPeriodo {
  return typeof v === "string" && (PRESETS as string[]).includes(v);
}

export interface Periodo {
  /** Primeiro dia, "AAAA-MM-DD", inclusivo. */
  de: string;
  /** Último dia, "AAAA-MM-DD", inclusivo. */
  ate: string;
  /** Instante em que o período abre. */
  inicio: Date;
  /**
   * Primeiro instante DE FORA do período. Comparar com `<` (e não `<=` com o
   * fim do dia) é o que garante que nada do último dia se perde.
   */
  fim: Date;
  /** "Julho 2026" ou "01/05/2026 a 30/06/2026" — o subtítulo do relatório. */
  rotulo: string;
  /** Dias corridos do recorte — denominador de "leads por dia". */
  dias: number;
}

/** Hoje no relógio da academia, "AAAA-MM-DD". */
export function hojeLocal(agora: Date = new Date()): string {
  return new Date(agora.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

/** Meia-noite do dia, no relógio da academia. */
export function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00${OFFSET}`);
}

/** Anda `n` dias (negativo volta). Conta em UTC para não tropeçar no fuso. */
export function somaDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** "07/08/2026" — como o balcão lê data. */
export function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}

/** Monta o período a partir dos dois dias, já com rótulo e instantes. */
export function periodoEntre(de: string, ate: string): Periodo {
  const inicio = inicioDoDia(de);
  const fim = inicioDoDia(somaDias(ate, 1));
  return {
    de,
    ate,
    inicio,
    fim,
    rotulo: rotularPeriodo(de, ate),
    dias: Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / DIA_MS)),
  };
}

/**
 * Mês inteiro vira "Julho 2026"; mês corrente ganha o "até" porque metade de um
 * mês parece queda quando comparada a um mês fechado, e o leitor precisa ver
 * isso no título. O resto sai como intervalo de datas.
 */
function rotularPeriodo(de: string, ate: string): string {
  const inicioMes = mesDaData(de);
  const fimMes = mesDaData(ate);
  const mesmoMes = inicioMes.ano === fimMes.ano && inicioMes.mes === fimMes.mes;
  const nomeDoMes = `${NOMES_MES[inicioMes.mes - 1]} ${inicioMes.ano}`;

  if (mesmoMes && de.endsWith("-01")) {
    const ultimo = diasNoMes(inicioMes.ano, inicioMes.mes);
    if (Number(ate.slice(-2)) === ultimo) return nomeDoMes;
    return `${nomeDoMes} (até ${formatarDia(ate)})`;
  }
  return `${formatarDia(de)} a ${formatarDia(ate)}`;
}

/** Primeiro dia do mês em que a data cai. */
function primeiroDoMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

/**
 * Traduz a escolha da tela em período.
 *
 * `personalizado` com data faltando ou invertida cai no mês atual em vez de
 * estourar: a exportação é um botão, e um botão que devolve erro 400 por causa
 * de um campo vazio é pior que um relatório do mês corrente.
 */
export function resolverPeriodo(
  preset: PresetPeriodo,
  personalizado?: { de?: string | null; ate?: string | null },
  agora: Date = new Date(),
): Periodo {
  const hoje = hojeLocal(agora);
  const { ano, mes } = mesDaData(hoje);

  if (preset === "personalizado") {
    const de = personalizado?.de;
    const ate = personalizado?.ate;
    if (ehDataISO(de) && ehDataISO(ate) && de <= ate) return periodoEntre(de, ate);
    return resolverPeriodo("mes-atual", undefined, agora);
  }

  if (preset === "mes-anterior") {
    const anterior = mesDeslocado(ano, mes, -1);
    const primeiro = dataISO(anterior.ano, anterior.mes, 1);
    const ultimo = dataISO(anterior.ano, anterior.mes, diasNoMes(anterior.ano, anterior.mes));
    return periodoEntre(primeiro, ultimo);
  }

  if (preset === "ultimos-3-meses" || preset === "ultimos-12-meses") {
    const passo = preset === "ultimos-3-meses" ? -2 : -11;
    const inicio = mesDeslocado(ano, mes, passo);
    return periodoEntre(dataISO(inicio.ano, inicio.mes, 1), hoje);
  }

  return periodoEntre(primeiroDoMes(hoje), hoje);
}

/**
 * Em que dia do calendário da academia esse instante caiu.
 *
 * Meia-noite cravada em UTC recebe tratamento à parte, e não é firula: o
 * lançamento de despesa nasce de um `<input type="date">`, e "2026-08-01" vira
 * `2026-08-01T00:00:00.000Z` no banco. Convertendo para o fuso daqui isso seria
 * 31/07 às 21h — a despesa do dia 1º cairia no fechamento do mês anterior. Um
 * carimbo assim é data sem hora, e o dia dele é ele mesmo.
 *
 * O contrário também vale: um pagamento das 22h de 31/07 é gravado como
 * `2026-08-01T01:00:00Z` e precisa voltar para 31/07.
 */
export function diaLocal(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  if (t % DIA_MS === 0) return new Date(t).toISOString().slice(0, 10);
  return new Date(t - OFFSET_MS).toISOString().slice(0, 10);
}

/** A data ISO cai dentro do período? Campo vazio nunca cai. */
export function dentro(periodo: Periodo, iso: string | undefined | null): boolean {
  const dia = diaLocal(iso);
  return dia !== null && dia >= periodo.de && dia <= periodo.ate;
}

/** Dias de calendário entre a data ISO e o fim do período (positivo = passado). */
export function diasAte(periodo: Periodo, iso: string | undefined | null): number {
  const dia = diaLocal(iso);
  if (dia === null) return 0;
  return Math.round((Date.parse(`${periodo.ate}T00:00:00Z`) - Date.parse(`${dia}T00:00:00Z`)) / DIA_MS);
}

/** Meses (arredondados) entre a data ISO e o fim do período. */
export function mesesAte(periodo: Periodo, iso: string | undefined | null): number {
  return Math.max(0, Math.round(diasAte(periodo, iso) / 30));
}
