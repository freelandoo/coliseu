/**
 * O relatório como documento, não como tela.
 *
 * Marketing e financeiro produzem a MESMA estrutura — indicadores, barras,
 * tabelas e planilhas. Quem desenha o PDF e quem escreve o CSV leem só isto e
 * nunca sabem de qual relatório se trata: acrescentar um terceiro relatório
 * (operacional, catraca) é escrever mais um montador, não mexer no papel.
 *
 * Os valores chegam aqui **já formatados em texto**. Formatar é decisão de
 * negócio ("R$ 1.234,00", "12,5%", "3 meses") e não do desenhista de página;
 * deixar número cru até o fim espalharia `toLocaleString` pelo renderizador.
 */

import { diaLocal, formatarDia } from "./periodo";

export type Tom = "neutro" | "ok" | "alerta" | "risco";

/** Um número grande com rótulo e uma linha de contexto — o cartão do topo. */
export interface Indicador {
  rotulo: string;
  valor: string;
  /** Como ler o número: base de cálculo, comparação, ressalva. */
  apoio?: string;
  tom?: Tom;
}

/** Uma barra do gráfico: `valor` dimensiona, `exibicao` é o que se lê. */
export interface LinhaBarra {
  rotulo: string;
  valor: number;
  exibicao: string;
  tom?: Tom;
}

export type Alinhamento = "esquerda" | "direita";

export interface Coluna {
  rotulo: string;
  alinhamento?: Alinhamento;
  /** Peso da coluna na divisão da largura. Sem isso, todas iguais. */
  peso?: number;
}

export type Bloco =
  | { tipo: "indicadores"; titulo: string; nota?: string; itens: Indicador[] }
  | { tipo: "barras"; titulo: string; nota?: string; itens: LinhaBarra[] }
  | {
      tipo: "tabela";
      titulo: string;
      nota?: string;
      colunas: Coluna[];
      linhas: string[][];
      /** Texto quando não há linha nenhuma — nunca deixar a seção muda. */
      vazio?: string;
    }
  | { tipo: "texto"; titulo: string; paragrafos: string[] };

/**
 * Bloco de dados brutos que acompanha o relatório na exportação em planilha.
 * É o que se joga no disparo de mensagem ou na campanha — a lista, não o
 * resumo. No PDF vira contagem; no CSV vira arquivo.
 */
export interface Planilha {
  /** Vira sufixo do arquivo: `coliseu-marketing-...-reativacao.csv`. */
  nome: string;
  titulo: string;
  colunas: string[];
  linhas: string[][];
}

export type TipoRelatorio = "marketing" | "financeiro";

export interface Relatorio {
  tipo: TipoRelatorio;
  titulo: string;
  /** Rótulo do período, já pronto ("Julho 2026"). */
  periodo: string;
  /** Quando saiu, "07/08/2026 14:32". */
  geradoEm: string;
  /** Quem pediu — o PDF circula fora do sistema e precisa de dono. */
  geradoPor: string;
  /** Ressalvas de leitura, impressas no rodapé da capa. */
  observacoes: string[];
  blocos: Bloco[];
  planilhas: Planilha[];
}

/* ---------- formatação ---------- */

export function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function pct(v: number, casas = 1): string {
  return `${v.toFixed(casas).replace(".", ",")}%`;
}

export function inteiro(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

export function numero(v: number, casas = 1): string {
  return v.toFixed(casas).replace(".", ",");
}

/** Divisão que não estoura em base zero — o mês sem lead é normal, não erro. */
export function razao(numerador: number, denominador: number): number {
  return denominador > 0 ? numerador / denominador : 0;
}

export function percentual(parte: number, total: number): number {
  return razao(parte, total) * 100;
}

/**
 * Data ISO em "07/08/2026" — as tabelas e planilhas usam sempre esta.
 * Passa pelo `diaLocal` para a despesa lançada no dia 1º não sair como dia 31
 * do mês anterior; ver a explicação lá.
 */
export function dataCurta(iso: string | undefined | null): string {
  const dia = diaLocal(iso);
  return dia ? formatarDia(dia) : "—";
}

/** Carimbo de geração do documento: "07/08/2026 às 14:32". */
export function dataHora(d: Date): string {
  const [data, hora] = d
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .split(", ");
  return `${data} às ${hora}`;
}
