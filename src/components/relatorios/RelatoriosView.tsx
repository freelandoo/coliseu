"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { PontoMensal } from "@/lib/types";

export type Tone = "red" | "ok" | "warn" | "neutral";

export interface BarDatum {
  label: string;
  valor: number;
  tone: Tone;
}

export interface Kpi {
  label: string;
  valor: number;
  formato: "moeda" | "pct" | "int";
  hint: string;
  tone?: Tone;
}

export interface RelatoriosData {
  kpis: Kpi[];
  funil: BarDatum[];
  planos: BarDatum[];
  financeiro: BarDatum[];
  retencao: BarDatum[];
  resultado: BarDatum[];
  serie: PontoMensal[];
}

const BAR_TONE: Record<Tone, string> = {
  red: "bg-gradient-to-r from-red-deep to-red-bright",
  ok: "bg-gradient-to-r from-[#2c6f4c] to-ok",
  warn: "bg-gradient-to-r from-[#8a6a24] to-warn",
  neutral: "bg-gradient-to-r from-elevated to-border-strong",
};

const KPI_TONE: Record<Tone, string> = {
  red: "text-red-bright",
  ok: "text-ok",
  warn: "text-warn",
  neutral: "text-ink",
};

/* ---------- formatação ---------- */
function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(v: number) {
  return `${v.toFixed(1).replace(".", ",")}%`;
}
function fmtInt(v: number) {
  return String(Math.round(v));
}
const FORMATADOR = { moeda: fmtMoeda, pct: fmtPct, int: fmtInt } as const;

/* ---------- número com count-up ---------- */
function CountUp({
  value,
  formato,
}: {
  value: number;
  formato: Kpi["formato"];
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = FORMATADOR[formato];

  useGSAP(
    () => {
      const alvo = { v: 0 };
      gsap.to(alvo, {
        v: value,
        duration: 1.1,
        ease: "power2.out",
        onUpdate: () => {
          if (ref.current) ref.current.textContent = fmt(alvo.v);
        },
      });
    },
    { dependencies: [value] },
  );

  return <span ref={ref}>{fmt(0)}</span>;
}

/* ---------- gráfico de barras horizontais ---------- */
function BarChart({ data, moeda = false }: { data: BarDatum[]; moeda?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(...data.map((d) => d.valor), 1);

  useGSAP(
    () => {
      gsap.from("[data-bar-fill]", {
        scaleX: 0,
        transformOrigin: "left center",
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs font-medium uppercase tracking-wide text-muted">
            {d.label}
          </span>
          <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-surface-2">
            <div
              data-bar-fill
              className={cn("h-full rounded-md", BAR_TONE[d.tone])}
              style={{ width: `${(Math.max(d.valor, 0) / max) * 100}%` }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink">
              {moeda ? formatBRL(d.valor) : d.valor}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- gráfico de linha (receita × cancelamentos) ---------- */
function LineChart({ serie }: { serie: PontoMensal[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const receitaRef = useRef<SVGPathElement>(null);
  const churnRef = useRef<SVGPathElement>(null);

  const W = 640;
  const H = 200;
  const pad = { l: 10, r: 10, t: 18, b: 10 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const x = (i: number) =>
    pad.l + (serie.length > 1 ? i / (serie.length - 1) : 0) * innerW;

  // Receita e cancelamentos têm escalas próprias (eixo duplo).
  const maxRec = Math.max(...serie.map((p) => p.receita), 1);
  const minRec = Math.min(...serie.map((p) => p.receita), 0);
  const spanRec = maxRec - minRec || 1;
  const yRec = (v: number) => pad.t + innerH - ((v - minRec) / spanRec) * innerH;

  const maxChurn = Math.max(...serie.map((p) => p.cancelamentos), 1);
  const yChurn = (v: number) => pad.t + innerH - (v / maxChurn) * innerH;

  const pathDe = (fn: (i: number) => number) =>
    serie
      .map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${fn(i).toFixed(1)}`)
      .join(" ");

  const linhaRec = pathDe((i) => yRec(serie[i].receita));
  const linhaChurn = pathDe((i) => yChurn(serie[i].cancelamentos));
  const area = `${linhaRec} L${pad.l + innerW},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z`;

  useGSAP(
    () => {
      for (const path of [receitaRef.current, churnRef.current]) {
        if (!path) continue;
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(path, { strokeDashoffset: 0, duration: 1.4, ease: "power2.out" });
      }
      gsap.from("[data-area]", { opacity: 0, duration: 1.1, ease: "power2.out" });
      gsap.from("[data-dot]", {
        scale: 0,
        transformOrigin: "center",
        duration: 0.3,
        stagger: 0.06,
        delay: 0.6,
        ease: "back.out(2)",
      });
    },
    { scope: ref },
  );

  return (
    <div>
      {/* legenda */}
      <div className="mb-3 flex items-center gap-4 text-[11px] uppercase tracking-wide text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-bright" />
          Receita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-warn" />
          Cancelamentos
        </span>
      </div>

      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="grad-receita" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-red-bright)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-red-bright)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path data-area d={area} fill="url(#grad-receita)" />

        {/* cancelamentos (eixo secundário) */}
        <path
          ref={churnRef}
          d={linhaChurn}
          fill="none"
          stroke="var(--color-warn)"
          strokeWidth={2}
          strokeDasharray="1 0"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
        {serie.map((p, i) => (
          <circle
            key={`c-${p.mes}`}
            data-dot
            cx={x(i)}
            cy={yChurn(p.cancelamentos)}
            r={3}
            fill="var(--color-warn)"
          />
        ))}

        {/* receita (eixo primário) */}
        <path
          ref={receitaRef}
          d={linhaRec}
          fill="none"
          stroke="var(--color-red-bright)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {serie.map((p, i) => (
          <circle
            key={`r-${p.mes}`}
            data-dot
            cx={x(i)}
            cy={yRec(p.receita)}
            r={4}
            fill="var(--color-bg)"
            stroke="var(--color-red-bright)"
            strokeWidth={2}
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[11px] uppercase tracking-wide text-faint">
        {serie.map((p) => (
          <span key={p.mes}>{p.mes}</span>
        ))}
      </div>
    </div>
  );
}

/* ---------- barras verticais (matrículas por mês) ---------- */
function BarrasVerticais({ serie }: { serie: PontoMensal[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(...serie.map((p) => p.matriculas), 1);

  useGSAP(
    () => {
      gsap.from("[data-vbar]", {
        scaleY: 0,
        transformOrigin: "bottom center",
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.08,
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="flex h-48 items-stretch justify-between gap-3">
      {serie.map((p) => (
        <div key={p.mes} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-semibold text-ink">{p.matriculas}</span>
          <div className="relative w-full flex-1">
            <div
              data-vbar
              className="absolute bottom-0 w-full rounded-t bg-gradient-to-t from-red-deep to-red-bright"
              style={{ height: `${(p.matriculas / max) * 100}%` }}
            />
          </div>
          <span className="text-[11px] uppercase tracking-wide text-faint">
            {p.mes}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({
  titulo,
  descricao,
  data,
  className,
  moeda = false,
}: {
  titulo: string;
  descricao: string;
  data: BarDatum[];
  className?: string;
  moeda?: boolean;
}) {
  return (
    <Card className={cn("p-6", className)}>
      <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
        {titulo}
      </h3>
      <p className="mb-5 mt-0.5 text-xs text-faint">{descricao}</p>
      <BarChart data={data} moeda={moeda} />
    </Card>
  );
}

/* ---------- view ---------- */
export function RelatoriosView({ data }: { data: RelatoriosData }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from("[data-kpi]", {
        opacity: 0,
        y: 16,
        duration: 0.5,
        ease: "power3.out",
        stagger: 0.06,
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="flex flex-col gap-8">
      {/* KPIs — no mobile viram linhas finas (rótulo à esquerda, valor à direita);
          a partir de sm voltam a ser cards empilhados. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {data.kpis.map((k) => (
          <Card
            key={k.label}
            data-kpi
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 p-4 sm:block sm:p-5"
          >
            <p className="col-start-1 row-start-1 text-xs font-medium uppercase tracking-widest text-faint">
              {k.label}
            </p>
            <p
              className={cn(
                "col-start-2 row-span-2 row-start-1 self-center text-right font-display text-3xl font-semibold leading-none tabular-nums",
                "sm:mt-2 sm:text-left sm:text-4xl",
                KPI_TONE[k.tone ?? "neutral"],
              )}
            >
              <CountUp value={k.valor} formato={k.formato} />
            </p>
            <p className="col-start-1 row-start-2 mt-0.5 text-sm text-muted sm:mt-2">
              {k.hint}
            </p>
          </Card>
        ))}
      </section>

      {/* resultado financeiro (receita × despesas × lucro) */}
      <ChartCard
        titulo="Resultado financeiro"
        descricao="Receita recorrente × despesas lançadas × lucro do mês"
        data={data.resultado}
        moeda
      />

      {/* gráficos */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          titulo="Funil de captação"
          descricao="Leads por estágio no pipeline"
          data={data.funil}
          className="lg:col-span-2"
        />
        <ChartCard
          titulo="Alunos por plano"
          descricao="Distribuição da base ativa"
          data={data.planos}
        />
        <ChartCard
          titulo="Situação financeira"
          descricao="Cobranças por status"
          data={data.financeiro}
        />
        <ChartCard
          titulo="Retenção por frequência"
          descricao="Alunos por faixa de ausência"
          data={data.retencao}
          className="lg:col-span-2"
        />
      </section>

      {/* evolução temporal */}
      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
                Evolução da receita
              </h3>
              <p className="mt-0.5 text-xs text-faint">MRR nos últimos meses</p>
            </div>
            {data.serie.length > 0 && (
              <span className="font-display text-2xl font-semibold text-red-bright tabular-nums">
                {fmtMoeda(data.serie[data.serie.length - 1].receita)}
              </span>
            )}
          </div>
          <div className="mt-5">
            <LineChart serie={data.serie} />
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-ink">
            Novas matrículas
          </h3>
          <p className="mb-5 mt-0.5 text-xs text-faint">Por mês</p>
          <BarrasVerticais serie={data.serie} />
        </Card>
      </section>
    </div>
  );
}
