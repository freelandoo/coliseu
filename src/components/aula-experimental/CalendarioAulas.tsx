"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { formatarDataCompleta, formatarHora, somarDias } from "@/lib/aula-experimental";
import { agruparPorData, gradeDoMes, mesDaData, rotuloMes } from "@/lib/calendario";
import type { AulaExperimentalItem } from "@/lib/types";

/**
 * A agenda de aulas experimentais vista como mês.
 *
 * O dia com visita mostra as horas marcadas (até duas, depois "+N") — não é
 * controle de vagas: a academia não tem capacidade por horário cadastrada, a
 * grade só conta o que foi marcado. Escolher um dia atualiza a "Agenda do dia"
 * ao lado; o mês, o dia e a direção da navegação moram em quem usa o
 * calendário, para sobreviver à ida à Lista e volta.
 *
 * `hoje` vem pronto do servidor, no relógio da academia — calcular aqui faria
 * servidor e navegador discordarem sobre que dia é hoje à noite.
 *
 * Teclado: só o dia selecionado entra no Tab; setas andam um dia ou uma
 * semana, Home/End vão ao começo/fim da semana, PageUp/PageDown trocam o mês.
 */
export type MesAncora = ReturnType<typeof mesDaData>;

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const SEMANA_EXTENSO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export function CalendarioAulas({
  aulas,
  hoje,
  ancora,
  direcao,
  selecionado,
  onEscolherDia,
  onAndarMes,
  onHoje,
}: {
  aulas: AulaExperimentalItem[];
  hoje: string;
  ancora: MesAncora;
  /** Para onde o mês andou por último (-1, 0, 1): a grade entra desse lado. */
  direcao: number;
  selecionado: string;
  /** `teclado`: navegação por setas — quem usa não deve rolar a tela por causa dela. */
  onEscolherDia: (data: string, origem?: "clique" | "teclado") => void;
  onAndarMes: (passo: number) => void;
  onHoje: () => void;
}) {
  const gradeRef = useRef<HTMLDivElement>(null);
  /** Pedido de foco depois de navegar por teclado (o dia novo só existe após o render). */
  const focarAposRender = useRef(false);

  const porData = useMemo(() => agruparPorData(aulas), [aulas]);
  const dias = useMemo(() => gradeDoMes(ancora.ano, ancora.mes), [ancora]);
  const noMes = useMemo(
    () => aulas.filter((a) => mesmoMes(a.data, ancora.ano, ancora.mes)).length,
    [aulas, ancora],
  );
  // O dia que entra no Tab: o selecionado, se estiver nesta grade; senão o 1º do mês.
  const diaFocavel = dias.some((d) => d.data === selecionado)
    ? selecionado
    : (dias.find((d) => d.doMes)?.data ?? dias[0]?.data);

  useEffect(() => {
    if (!focarAposRender.current) return;
    focarAposRender.current = false;
    gradeRef.current?.querySelector<HTMLButtonElement>(`[data-dia="${selecionado}"]`)?.focus();
  }, [selecionado, ancora]);

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo =
      e.key === "ArrowLeft" ? -1
      : e.key === "ArrowRight" ? 1
      : e.key === "ArrowUp" ? -7
      : e.key === "ArrowDown" ? 7
      : null;
    if (passo !== null) {
      e.preventDefault();
      focarAposRender.current = true;
      onEscolherDia(somarDias(selecionado, passo), "teclado");
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const [a, m, d] = selecionado.split("-").map(Number);
      const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
      focarAposRender.current = true;
      onEscolherDia(somarDias(selecionado, e.key === "Home" ? -semana : 6 - semana), "teclado");
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      onAndarMes(e.key === "PageUp" ? -1 : 1);
    }
  }

  const naGradeDeHoje = mesmoMes(hoje, ancora.ano, ancora.mes);

  return (
    <div className="flex flex-col gap-3">
      {/* mês: ‹ OUTUBRO 2026 › … Hoje */}
      <div className="flex items-center gap-2 sm:gap-3">
        <SetaMes direcao={-1} onClick={() => onAndarMes(-1)} />
        <div className="min-w-0 flex-1 text-center sm:flex-none sm:text-left">
          <h2
            aria-live="polite"
            className="font-display text-lg font-semibold uppercase tracking-[0.08em] text-ink sm:min-w-[11.5rem] sm:text-xl"
          >
            {rotuloMes(ancora.ano, ancora.mes)}
          </h2>
        </div>
        <SetaMes direcao={1} onClick={() => onAndarMes(1)} />
        <p className="ml-auto hidden text-xs text-muted tabular-nums sm:block">
          {noMes === 0 ? "nenhuma visita no mês" : `${noMes} visita${noMes > 1 ? "s" : ""} no mês`}
        </p>
        <button
          type="button"
          onClick={onHoje}
          disabled={naGradeDeHoje && selecionado === hoje}
          className={cn(
            "min-h-9 border border-control px-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink",
            "transition-[background-color,border-color,color,transform] duration-150 ease-padrao active:scale-[0.97]",
            "hover:border-ink disabled:cursor-default disabled:border-border disabled:text-faint disabled:active:scale-100",
          )}
        >
          Hoje
        </button>
      </div>

      {/* grade: o fundo da grade aparece nos vãos de 1px como linhas dos dias */}
      <div
        ref={gradeRef}
        role="group"
        aria-label={`Dias de ${rotuloMes(ancora.ano, ancora.mes)}. Setas mudam o dia; Page Up e Page Down mudam o mês.`}
        onKeyDown={aoTeclar}
        className="overflow-hidden border border-border"
      >
        <div aria-hidden className="grid grid-cols-7 border-b border-border bg-painel-2">
          {SEMANA.map((d, i) => (
            <span
              key={d}
              className={cn(
                "py-2 text-center font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]",
                i === 0 || i === 6 ? "text-faint" : "text-muted",
              )}
            >
              {d}
            </span>
          ))}
        </div>

        <div
          key={`${ancora.ano}-${ancora.mes}`}
          style={{ "--dir": direcao } as CSSProperties}
          className="troca-mes grid grid-cols-7 gap-px bg-border"
        >
          {dias.map((d, i) => {
            const doDia = porData.get(d.data) ?? [];
            const horas = [...doDia].sort((a, b) => a.hora - b.hora).map((a) => a.hora);
            const ehSelecionado = d.data === selecionado;
            const ehHoje = d.data === hoje;
            const fimDeSemana = i % 7 === 0 || i % 7 === 6;
            const n = doDia.length;
            return (
              <button
                key={d.data}
                data-dia={d.data}
                type="button"
                tabIndex={d.data === diaFocavel ? 0 : -1}
                onClick={() => onEscolherDia(d.data, "clique")}
                aria-pressed={ehSelecionado}
                aria-current={ehHoje ? "date" : undefined}
                aria-label={`${SEMANA_EXTENSO[i % 7]}, ${formatarDataCompleta(d.data)}${ehHoje ? ", hoje" : ""}${
                  n > 0 ? ` · ${n} visita${n > 1 ? "s" : ""}: ${horas.map(formatarHora).join(", ")}` : " · sem visitas"
                }`}
                className={cn(
                  "group relative flex min-h-12 flex-col items-center gap-1 px-1 pb-1.5 pt-1.5 text-left outline-offset-[-2px] sm:min-h-[4.5rem] xl:min-h-[5rem]",
                  "transition-[background-color,color] duration-150 ease-padrao",
                  ehSelecionado
                    ? "bg-brand text-white"
                    : cn(fimDeSemana ? "bg-[#111114]" : "bg-painel", "text-ink hover:bg-painel-2"),
                )}
              >
                {/* hoje: fio vermelho no topo + rótulo — nunca só a cor */}
                {ehHoje && !ehSelecionado && (
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-destaque" />
                )}
                <span
                  className={cn(
                    "font-display text-[0.9375rem] leading-none tabular-nums sm:text-base",
                    !d.doMes && !ehSelecionado ? "font-normal text-faint" : "font-semibold",
                    ehHoje && !ehSelecionado && "text-destaque",
                  )}
                >
                  {d.dia}
                </span>
                {ehHoje && (
                  <span
                    aria-hidden
                    className={cn(
                      "font-mono text-[0.625rem] font-medium uppercase leading-none tracking-[0.12em]",
                      ehSelecionado ? "text-white" : "text-destaque",
                    )}
                  >
                    hoje
                  </span>
                )}

                {n > 0 && (
                  <>
                    {/* celular: a contagem num quadradinho */}
                    <span
                      aria-hidden
                      className={cn(
                        "mt-auto flex h-4 min-w-4 items-center justify-center px-1 text-[0.6875rem] font-semibold tabular-nums sm:hidden",
                        ehSelecionado ? "bg-white text-brand" : "bg-brand text-white",
                      )}
                    >
                      {n}
                    </span>
                    {/* tela larga: as horas (até duas) e "+N" */}
                    <span aria-hidden className="mt-auto hidden w-full flex-wrap justify-center gap-1 sm:flex">
                      {horas.slice(0, horas.length > 2 ? 1 : 2).map((h, k) => (
                        <ChipHora key={`${h}-${k}`} selecionado={ehSelecionado}>
                          {formatarHora(h)}
                        </ChipHora>
                      ))}
                      {horas.length > 2 && (
                        <ChipHora selecionado={ehSelecionado} resumo>
                          +{horas.length - 1}
                        </ChipHora>
                      )}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChipHora({
  children,
  selecionado,
  resumo = false,
}: {
  children: React.ReactNode;
  selecionado: boolean;
  resumo?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 px-1.5 text-[0.6875rem] font-semibold tabular-nums",
        selecionado ? "bg-white text-brand" : resumo ? "bg-painel-2 text-ink" : "bg-surface text-[#151518]",
      )}
    >
      {!resumo && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
      {children}
    </span>
  );
}

function mesmoMes(data: string, ano: number, mes: number): boolean {
  const m = mesDaData(data);
  return m.ano === ano && m.mes === mes;
}

function SetaMes({ direcao, onClick }: { direcao: -1 | 1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direcao === -1 ? "Mês anterior" : "Próximo mês"}
      className="flex h-9 w-10 shrink-0 items-center justify-center border border-control text-ink transition-[border-color,transform] duration-150 ease-padrao hover:border-ink active:scale-[0.97]"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <path
          d={direcao === -1 ? "M8.5 3L4.5 7l4 4" : "M5.5 3l4 4-4 4"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
