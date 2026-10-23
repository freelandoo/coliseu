"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { PontoMensal } from "@/lib/types";

/**
 * Os dois gráficos do tempo dos Relatórios. Eram um só, com dois eixos
 * (receita em reais e matrículas vencidas em unidades) — o alinhamento das
 * escalas inventava uma correlação. Agora cada medida tem o seu:
 * - `LinhaRecebido`: reais por mês, uma série;
 * - `ColunasMatriculas`: novas × vencidas sem renovar, mesma unidade, um eixo.
 *
 * O SVG é desenhado em pixels da largura real (ResizeObserver), para o texto
 * do eixo não encolher no celular. Passar o ponteiro (ou as setas, com foco no
 * gráfico) mostra o mês inteiro; a tabela ao lado tem os mesmos números.
 */

const ALTURA = 200;
const MARGEM = { esq: 52, dir: 12, topo: 12, base: 26 };

const COR = { recebido: "var(--color-brand)", novas: "var(--color-brand)", vencidas: "var(--color-info)" };

/** As mesmas séries no tooltip, que é escuro: vermelho vivo e azul claro no lugar dos tons do papel. */
const COR_DICA = { marca: "#ff4b3e", azul: "#5f93dd" } as const;

/** Degraus "redondos" (1, 2, 5 × 10ⁿ) do zero até passar do máximo. */
function degraus(max: number, quantos = 4): number[] {
  if (max <= 0) return [0, 1];
  const bruto = max / quantos;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * base).find((p) => p >= bruto) ?? bruto;
  const fim = Math.ceil(max / passo) * passo;
  const lista: number[] = [];
  for (let v = 0; v <= fim + passo / 2; v += passo) lista.push(v);
  return lista;
}

function moedaCurta(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString("pt-BR")}`;
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.round(e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, largura };
}

/** Escala e geometria comuns: meses no x (faixas iguais), um eixo y do zero. */
function geometria(largura: number, n: number, max: number) {
  const ticks = degraus(max);
  const topo = ticks[ticks.length - 1] || 1;
  const w = Math.max(largura - MARGEM.esq - MARGEM.dir, 1);
  const h = ALTURA - MARGEM.topo - MARGEM.base;
  const faixa = w / Math.max(n, 1);
  return {
    ticks,
    faixa,
    centro: (i: number) => MARGEM.esq + faixa * (i + 0.5),
    y: (v: number) => MARGEM.topo + h - (v / topo) * h,
    base: MARGEM.topo + h,
  };
}

/**
 * A moldura interativa: eixo, grade, faixa do mês ativo e o tooltip. O
 * conteúdo (linha ou colunas) vem de `desenhar`.
 */
function Moldura({
  serie,
  max,
  formatarTick,
  rotulo,
  linhasDica,
  desenhar,
}: {
  serie: PontoMensal[];
  max: number;
  formatarTick: (v: number) => string;
  rotulo: string;
  linhasDica: (p: PontoMensal) => { tom: keyof typeof COR_DICA; nome: string; valor: string; traco?: "linha" | "barra" }[];
  desenhar: (g: ReturnType<typeof geometria>) => ReactNode;
}) {
  const { ref, largura } = useLargura();
  const [ativo, setAtivo] = useState<number | null>(null);
  const g = geometria(largura, serie.length, max);

  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - MARGEM.esq;
    setAtivo(Math.min(serie.length - 1, Math.max(0, Math.floor(x / g.faixa))));
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const passo = e.key === "ArrowRight" ? 1 : -1;
    setAtivo((a) => Math.min(serie.length - 1, Math.max(0, (a ?? (passo > 0 ? -1 : serie.length)) + passo)));
  }

  const ponto = ativo !== null ? serie[ativo] : null;
  const xDica = ativo !== null ? g.centro(ativo) : 0;

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`${rotulo}. Use as setas para percorrer os meses.`}
      onKeyDown={aoTeclar}
      onBlur={() => setAtivo(null)}
      className="relative w-full min-w-0 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foco"
    >
      {largura > 0 && (
        <svg
          width={largura}
          height={ALTURA}
          onPointerMove={aoMover}
          onPointerLeave={() => setAtivo(null)}
          className="block touch-pan-y"
          aria-hidden
        >
          {/* grade e eixo: linha fina, cheia, um degrau acima do papel */}
          {g.ticks.map((t) => (
            <g key={t}>
              <line
                x1={MARGEM.esq}
                x2={largura - MARGEM.dir}
                y1={g.y(t)}
                y2={g.y(t)}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={MARGEM.esq - 8}
                y={g.y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted text-[11px] tabular-nums"
              >
                {formatarTick(t)}
              </text>
            </g>
          ))}
          {ativo !== null && (
            <rect
              x={g.centro(ativo) - g.faixa / 2}
              y={MARGEM.topo}
              width={g.faixa}
              height={g.base - MARGEM.topo}
              fill="var(--color-surface-2)"
            />
          )}
          {desenhar(g)}
          {serie.map((p, i) => (
            <text
              key={p.mes}
              x={g.centro(i)}
              y={ALTURA - 8}
              textAnchor="middle"
              className={cn("text-[11px]", i === ativo ? "fill-ink font-semibold" : "fill-muted")}
            >
              {p.mes}
              {p.parcial ? "*" : ""}
            </text>
          ))}
        </svg>
      )}
      {!largura && <div style={{ height: ALTURA }} />}

      {ponto && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-md bg-painel px-3 py-2 text-xs text-[#f7f7f5] shadow-[var(--shadow-overlay)]"
          style={{
            left: Math.min(Math.max(xDica - 72, 0), Math.max(largura - 160, 0)),
          }}
        >
          <p className="mb-1 text-[#b9b9c0]">
            {ponto.mes}
            {ponto.parcial ? " · em andamento" : ""}
          </p>
          {linhasDica(ponto).map((l) => (
            <p key={l.nome} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn("shrink-0", l.traco === "barra" ? "h-2.5 w-2.5 rounded-[2px]" : "h-0.5 w-3 rounded-full")}
                style={{ background: COR_DICA[l.tom] }}
              />
              <span className="font-semibold tabular-nums">{l.valor}</span>
              <span className="text-[#b9b9c0]">{l.nome}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Recebido por mês: linha de 2px com véu de 10%; o mês corrente sai tracejado. */
export function LinhaRecebido({ serie }: { serie: PontoMensal[] }) {
  const max = Math.max(...serie.map((p) => p.receita), 0);
  return (
    <Moldura
      serie={serie}
      max={max}
      formatarTick={moedaCurta}
      rotulo="Recebido por mês"
      linhasDica={(p) => [{ tom: "marca", nome: "recebido", valor: moeda(p.receita) }]}
      desenhar={(g) => {
        const pts = serie.map((p, i) => [g.centro(i), g.y(p.receita)] as const);
        const ultimoFechado = serie.findLastIndex((p) => !p.parcial);
        const fechados = pts.slice(0, ultimoFechado + 1);
        const caminho = (lista: readonly (readonly [number, number])[]) =>
          lista.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
        const area = fechados.length
          ? `${caminho(fechados)} L${fechados[fechados.length - 1][0]},${g.base} L${fechados[0][0]},${g.base} Z`
          : "";
        const parcial = ultimoFechado >= 0 && ultimoFechado < pts.length - 1 ? pts.slice(ultimoFechado) : [];
        return (
          <>
            {area && <path d={area} fill={COR.recebido} opacity={0.1} className="aparece" />}
            <path
              d={caminho(fechados)}
              pathLength={1}
              fill="none"
              stroke={COR.recebido}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="traca"
            />
            {parcial.length > 1 && (
              <path
                d={caminho(parcial)}
                fill="none"
                stroke={COR.recebido}
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinecap="round"
                opacity={0.6}
              />
            )}
            {pts.map(([x, y], i) => (
              <circle
                key={serie[i].mes}
                cx={x}
                cy={y}
                r={4}
                fill={serie[i].parcial ? "var(--color-surface)" : COR.recebido}
                stroke={serie[i].parcial ? COR.recebido : "var(--color-surface)"}
                strokeWidth={2}
              />
            ))}
          </>
        );
      }}
    />
  );
}

/** Matrículas por mês: novas e vencidas sem renovar, lado a lado, num eixo só. */
export function ColunasMatriculas({ serie }: { serie: PontoMensal[] }) {
  const max = Math.max(...serie.flatMap((p) => [p.matriculas, p.cancelamentos]), 0);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COR.novas }} />
          Novas matrículas
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: COR.vencidas }} />
          Vencidas sem renovar
        </span>
      </div>
      <Moldura
        serie={serie}
        max={max}
        formatarTick={(v) => v.toLocaleString("pt-BR")}
        rotulo="Matrículas por mês: novas e vencidas sem renovar"
        linhasDica={(p) => [
          { tom: "marca", nome: "novas", valor: p.matriculas.toLocaleString("pt-BR"), traco: "barra" },
          { tom: "azul", nome: "vencidas sem renovar", valor: p.cancelamentos.toLocaleString("pt-BR"), traco: "barra" },
        ]}
        desenhar={(g) => {
          // Coluna até 24px, 2px de papel entre o par; o resto da faixa é ar.
          const larg = Math.min(24, (g.faixa - 18) / 2);
          return serie.map((p, i) => {
            const c = g.centro(i);
            return (
              <g key={p.mes} opacity={p.parcial ? 0.6 : 1}>
                {[
                  { v: p.matriculas, x: c - larg - 1, cor: COR.novas },
                  { v: p.cancelamentos, x: c + 1, cor: COR.vencidas },
                ].map((b, j) => {
                  const topo = g.y(b.v);
                  const alt = g.base - topo;
                  if (alt <= 0) return null;
                  const r = Math.min(4, alt, larg / 2);
                  // Ponta arredondada, base reta.
                  const d = `M${b.x},${g.base} V${topo + r} Q${b.x},${topo} ${b.x + r},${topo} H${b.x + larg - r} Q${b.x + larg},${topo} ${b.x + larg},${topo + r} V${g.base} Z`;
                  return (
                    <path
                      key={j}
                      d={d}
                      fill={b.cor}
                      className="coluna-cresce"
                      style={{ animationDelay: `${i * 50}ms` }}
                    />
                  );
                })}
              </g>
            );
          });
        }}
      />
    </>
  );
}
