import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Peças de gráfico dos Relatórios (servidor, sem biblioteca). Regras da casa
 * (skill de dataviz):
 * - uma série = uma cor (a marca); a barra que conta a história fica na cor e
 *   as outras em cinza — estado nunca é dito só pela cor, o rótulo diz;
 * - barra fina (18px), ponta arredondada, base reta, valor na ponta em tinta;
 * - todo gráfico tem a tabela ao lado ("Ver em tabela").
 *
 * Por que não pintar por estado: no papel, o âmbar de "pendente" e o vermelho
 * de "atrasado" ficam a ΔE 0,9 para quem tem deuteranopia — iguais.
 */

export interface BarDatum {
  label: string;
  valor: number;
  /** A barra que o leitor deve ver primeiro. Sem nenhuma marcada, todas na cor. */
  destaque?: boolean;
}

/** Barras horizontais de uma série. `formatar` escreve o valor da ponta e da tabela. */
export function Barras({
  dados,
  formatar = (v) => v.toLocaleString("pt-BR"),
  rotulo,
}: {
  dados: BarDatum[];
  formatar?: (v: number) => string;
  /** Nome da medida, para a tabela e o leitor de tela. */
  rotulo: string;
}) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const comDestaque = dados.some((d) => d.destaque);
  return (
    <>
      <ul className="flex flex-col gap-2.5" aria-label={rotulo}>
        {dados.map((d, i) => {
          const fracao = Math.max(d.valor, 0) / max;
          const forte = !comDestaque || d.destaque;
          return (
            <li key={d.label} className="group grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
              <span className="truncate text-xs font-medium text-muted" title={d.label}>
                {d.label}
              </span>
              {/* A barra cede espaço ao número: ele mora fora, na ponta, e nunca é cortado. */}
              <span className="flex min-w-0 items-center gap-2 border-l border-border-strong">
                <span
                  aria-hidden
                  className={cn(
                    "barra-cresce h-[18px] rounded-r-[4px] transition-[filter] group-hover:brightness-110",
                    forte ? "bg-brand" : "bg-control/55",
                  )}
                  style={{ width: `calc((100% - 6.5rem) * ${fracao})`, animationDelay: `${i * 60}ms` }}
                />
                <span className={cn("shrink-0 text-xs tabular-nums", forte ? "font-semibold text-ink" : "text-muted")}>
                  {formatar(d.valor)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <TabelaDados
        colunas={["", rotulo]}
        linhas={dados.map((d) => [d.label, formatar(d.valor)])}
      />
    </>
  );
}

/** A versão em tabela de um gráfico — o mesmo dado, sem depender de cor nem de hover. */
export function TabelaDados({ colunas, linhas }: { colunas: string[]; linhas: (string | number)[][] }) {
  return (
    <details className="group mt-4 text-xs">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 font-medium text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
        Ver em tabela
      </summary>
      <table className="mt-2 w-full border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            {colunas.map((c, i) => (
              <th key={i} className={cn("py-1.5 font-semibold", i > 0 && "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {l.map((v, j) => (
                <td key={j} className={cn("py-1.5", j > 0 ? "text-right tabular-nums text-ink" : "text-muted")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Moldura de cartão de gráfico: título, o que o gráfico responde, e o gráfico. */
export function CartaoGrafico({
  titulo,
  descricao,
  acao,
  className,
  children,
}: {
  titulo: string;
  descricao: string;
  /** Número de destaque à direita do título (o "hero" do cartão). */
  acao?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{titulo}</h3>
          <p className="mt-0.5 text-xs text-muted">{descricao}</p>
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}
