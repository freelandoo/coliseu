import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Número que sobe de 0 até o valor ao aparecer (classe `.contador` em
 * globals.css). Animação 100% CSS: nasce pintada no HTML do servidor, sem
 * piscar na hidratação. O leitor de tela lê o valor final, nunca a contagem.
 *
 * Inteiros de 0 a 999.999; `zeros` reproduz o `padStart(2, "0")` dos
 * indicadores do tabloide.
 */
export function Contador({
  valor,
  zeros = false,
  atraso,
  className,
}: {
  valor: number;
  zeros?: boolean;
  /** atraso da contagem (ms), para acompanhar a entrada do bloco */
  atraso?: number;
  className?: string;
}) {
  const inteiro = Math.max(0, Math.trunc(valor));
  const texto = zeros ? String(inteiro).padStart(2, "0") : inteiro.toLocaleString("pt-BR");
  // fora da faixa do contador em CSS: mostra pronto
  if (inteiro >= 1_000_000) return <span className={cn("tabular-nums", className)}>{texto}</span>;
  const mil = inteiro >= 1000;
  const estilo = { "--n": inteiro, ...(mil && { "--de": 1000 }), ...(atraso !== undefined && { "--atraso": `${atraso}ms` }) } as CSSProperties;
  return (
    <span
      className={cn("contador tabular-nums", className)}
      style={estilo}
      data-mil={mil ? "" : undefined}
      data-zeros={zeros && inteiro < 10 ? "" : undefined}
    >
      <span className="sr-only">{texto}</span>
      <span aria-hidden data-texto={texto} />
    </span>
  );
}
