import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { PontoMensal } from "@/lib/types";
import { Barras, CartaoGrafico, TabelaDados, type BarDatum } from "@/components/relatorios/graficos";
import { ColunasMatriculas, LinhaRecebido } from "@/components/relatorios/GraficosMensais";

export type { BarDatum };

/** Cor do número do indicador. Só onde o sentido é de estado (bom/ruim). */
export type Tom = "neutro" | "bom" | "alerta" | "ruim";

export interface Kpi {
  label: string;
  valor: number;
  formato: "moeda" | "pct" | "int";
  hint: string;
  tom?: Tom;
}

export interface RelatoriosData {
  kpis: Kpi[];
  resultado: { receita: number; despesas: number; lucro: number };
  funil: BarDatum[];
  planos: BarDatum[];
  financeiro: BarDatum[];
  retencao: BarDatum[];
  serie: PontoMensal[];
  evasaoTempo: BarDatum[]; // ponto de evasão — cancelamentos por tempo de casa
  retencaoCoorte: BarDatum[]; // retenção por coorte (% ainda ativo)
}

const KPI_TOM: Record<Tom, string> = {
  neutro: "text-ink",
  bom: "text-success",
  alerta: "text-warning",
  ruim: "text-danger",
};

function fmtPct(v: number) {
  return `${v.toFixed(1).replace(".", ",")}%`;
}
const FORMATADOR = {
  moeda: formatBRL,
  pct: fmtPct,
  int: (v: number) => Math.round(v).toLocaleString("pt-BR"),
} as const;

/**
 * Receita − despesas = lucro, escrito como conta. Três números com o mesmo
 * peso pediam um número, não um gráfico de três barras (e lucro negativo não
 * cabe numa barra que cresce do zero).
 */
function Resultado({ receita, despesas, lucro }: RelatoriosData["resultado"]) {
  const termo = "flex min-w-0 flex-col gap-1";
  const valor = "font-display text-2xl font-semibold leading-none sm:text-3xl";
  const operador = "self-end pb-1 text-xl font-light text-muted";
  return (
    <CartaoGrafico titulo="Resultado do mês" descricao="Receita recorrente menos as despesas lançadas">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className={termo}>
          <span className="text-xs text-muted">Receita recorrente</span>
          <span className={cn(valor, "text-ink")}>{formatBRL(receita)}</span>
        </div>
        {/* O operador anda com o termo seguinte: quebra de linha nunca o deixa sozinho. */}
        <div className="flex items-end gap-5">
          <span aria-hidden className={operador}>−</span>
          <div className={termo}>
            <span className="text-xs text-muted">Despesas</span>
            <span className={cn(valor, "text-ink")}>{formatBRL(despesas)}</span>
          </div>
        </div>
        <div className="flex items-end gap-5">
          <span aria-hidden className={operador}>=</span>
          <div className={termo}>
            <span className="text-xs text-muted">{lucro >= 0 ? "Lucro" : "Prejuízo"}</span>
            <span className={cn(valor, lucro >= 0 ? "text-success" : "text-danger")}>{formatBRL(lucro)}</span>
          </div>
        </div>
      </div>
      {receita > 0 && (
        // Quanto da receita as despesas comem: a única proporção que importa aqui.
        <div className="mt-5">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span className="barra-cresce h-full bg-brand" style={{ width: `${Math.min(100, (despesas / receita) * 100)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Despesas = {fmtPct(Math.min(999, (despesas / receita) * 100))} da receita
          </p>
        </div>
      )}
    </CartaoGrafico>
  );
}

/**
 * Relatórios: indicadores no topo, depois o tempo (recebido e matrículas), e
 * as distribuições. Cada gráfico tem a sua tabela.
 */
export function RelatoriosView({ data }: { data: RelatoriosData }) {
  // O destaque é o último mês fechado: o corrente ainda está acumulando.
  const mesParcial = data.serie.find((p) => p.parcial);
  const ultimoFechado = [...data.serie].reverse().find((p) => !p.parcial);
  const int = (v: number) => v.toLocaleString("pt-BR");

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {data.kpis.map((k, i) => (
          <div
            key={k.label}
            className="revela grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] sm:block"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <p className="col-start-1 row-start-1 text-sm font-medium text-muted">{k.label}</p>
            <p
              className={cn(
                "col-start-2 row-span-2 row-start-1 self-center text-right font-display text-2xl font-semibold leading-none",
                "sm:mt-1.5 sm:text-left sm:text-3xl",
                KPI_TOM[k.tom ?? "neutro"],
              )}
            >
              {FORMATADOR[k.formato](k.valor)}
            </p>
            <p className="col-start-1 row-start-2 mt-0.5 text-xs text-muted sm:mt-2">{k.hint}</p>
          </div>
        ))}
      </section>

      <Resultado {...data.resultado} />

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <CartaoGrafico
          titulo="Recebido por mês"
          descricao="Pagamentos confirmados, pela data em que o dinheiro entrou"
          acao={
            ultimoFechado && (
              <span className="shrink-0 text-right">
                <span className="block font-display text-2xl font-semibold text-ink">
                  {formatBRL(ultimoFechado.receita)}
                </span>
                <span className="text-xs text-muted">em {ultimoFechado.mes}</span>
              </span>
            )
          }
        >
          <LinhaRecebido serie={data.serie} />
          {mesParcial && (
            <p className="mt-2 text-xs text-muted">* {mesParcial.mes}: mês em andamento, ainda acumulando.</p>
          )}
          <TabelaDados
            colunas={["Mês", "Recebido"]}
            linhas={data.serie.map((p) => [`${p.mes}${p.parcial ? " (parcial)" : ""}`, formatBRL(p.receita)])}
          />
        </CartaoGrafico>

        <CartaoGrafico titulo="Matrículas por mês" descricao="Quantas entraram e quantas venceram sem renovar">
          <ColunasMatriculas serie={data.serie} />
          <TabelaDados
            colunas={["Mês", "Novas", "Vencidas sem renovar"]}
            linhas={data.serie.map((p) => [`${p.mes}${p.parcial ? " (parcial)" : ""}`, int(p.matriculas), int(p.cancelamentos)])}
          />
        </CartaoGrafico>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CartaoGrafico titulo="Funil de captação" descricao="Leads por estágio, do primeiro contato à matrícula">
          <Barras dados={data.funil} rotulo="Leads" />
        </CartaoGrafico>
        <CartaoGrafico titulo="Situação das cobranças" descricao="Cobranças por status — atrasadas em destaque">
          <Barras dados={data.financeiro} rotulo="Cobranças" />
        </CartaoGrafico>
        <CartaoGrafico titulo="Alunos por plano" descricao="Distribuição da base ativa">
          <Barras dados={data.planos} rotulo="Alunos" />
        </CartaoGrafico>
        <CartaoGrafico titulo="Frequência" descricao="Alunos por tempo sem aparecer — 21+ dias em destaque">
          <Barras dados={data.retencao} rotulo="Alunos" />
        </CartaoGrafico>
        <CartaoGrafico
          titulo="Ponto de evasão"
          descricao="Em que tempo de casa os alunos mais cancelam — aja antes desse ponto"
        >
          <Barras dados={data.evasaoTempo} rotulo="Cancelamentos" />
        </CartaoGrafico>
        <CartaoGrafico titulo="Retenção por coorte" descricao="% ainda ativo, por tempo desde a matrícula">
          <Barras dados={data.retencaoCoorte} rotulo="% ativo" formatar={(v) => `${v}%`} />
        </CartaoGrafico>
      </section>
    </div>
  );
}
