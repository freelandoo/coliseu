"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatarHora } from "@/lib/aula-experimental";
import { linkAgendaDoDia, linkConversa, type DiaFaixa } from "@/lib/central";
import type { AulaExperimentalItem } from "@/lib/types";
import { CabecaPainel, EstadoBloco, IconeCalendario, IconeSeta, PainelCentral } from "@/components/painel/central-ui";

/**
 * Aulas experimentais dos próximos dias. Cada linha é um AGENDAMENTO — a
 * central não sabe (e não diz) se a pessoa veio, confirmou ou se há vaga: não
 * existe capacidade cadastrada nem registro de presença da visita.
 *
 * `aulas === null` = falhou ao carregar (não é "dia livre").
 */
export function CentralAgenda({
  aulas,
  dias,
  hoje,
  atraso,
}: {
  aulas: AulaExperimentalItem[] | null;
  dias: DiaFaixa[];
  hoje: string;
  atraso?: number;
}) {
  const [dia, setDia] = useState(hoje);
  const doDia = (aulas ?? []).filter((a) => a.data === dia);
  const escolhido = dias.find((d) => d.data === dia) ?? dias[0];

  return (
    <PainelCentral aria-labelledby="central-agenda" atraso={atraso}>
      <CabecaPainel
        icone={<IconeCalendario />}
        titulo="Aulas experimentais"
        id="central-agenda"
        contagem={aulas === null ? null : doDia.length}
        rotuloContagem={`${doDia.length} agendadas em ${escolhido.porExtenso}`}
      />

      <div role="group" aria-label="Dia da agenda" className="mx-4 grid grid-cols-7 gap-1 border-b border-border pb-3">
        {dias.map((d) => {
          const ativo = d.data === dia;
          const tem = (aulas ?? []).some((a) => a.data === d.data);
          return (
            <button
              key={d.data}
              type="button"
              aria-pressed={ativo}
              aria-label={`${d.porExtenso}${d.data === hoje ? " (hoje)" : ""}${tem ? ", com aulas marcadas" : ""}`}
              onClick={() => setDia(d.data)}
              className={cn(
                "relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[10px] px-0.5 py-1.5",
                "transition-[background-color,color,box-shadow] duration-200",
                ativo
                  ? "bg-acao text-[#f8eaf0] shadow-[0_4px_10px_-2px_rgb(98_20_44/0.35)]"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <span className="text-xs uppercase leading-none">{d.semana}</span>
              <span className="text-[15px] font-medium leading-tight tabular-nums">{d.dia}</span>
              {/* marcador "tem agendamento" — não é ocupação nem vaga */}
              <span
                aria-hidden
                className={cn(
                  "h-1 w-1 rounded-full",
                  tem ? (ativo ? "bg-[#f8eaf0]" : "bg-brand") : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>

      {aulas === null ? (
        <EstadoBloco tom="erro" titulo="Não foi possível carregar a agenda agora.">
          As conversas e os números seguem valendo.
        </EstadoBloco>
      ) : doDia.length === 0 ? (
        <EstadoBloco titulo="Nenhuma aula experimental marcada.">
          {dia === hoje ? "Hoje está livre na agenda." : `Nada marcado para ${escolhido.porExtenso}.`}
        </EstadoBloco>
      ) : (
        <ol key={dia} className="troca flex flex-1 flex-col gap-4 px-5 pb-2 pt-4" aria-label={`Aulas de ${escolhido.porExtenso}`}>
          {doDia.map((a, i) => (
            <li key={a.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
              <span className="pt-px text-sm font-medium tabular-nums text-muted">{formatarHora(a.hora)}</span>
              <div className={cn("min-w-0 border-l-2 pl-3", i === 0 ? "border-brand" : "border-border")}>
                <p className="text-sm font-semibold text-ink">{a.modalidade}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {a.nome} · aula experimental
                </p>
                {a.conversaId && (
                  <Link
                    href={linkConversa(a.conversaId)}
                    className="mt-1 inline-flex min-h-8 items-center gap-1 text-[13px] font-medium text-destaque underline-offset-2 hover:underline"
                  >
                    Conversa
                    <IconeSeta className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mx-5 mt-auto border-t border-border py-3">
        <Link
          href={linkAgendaDoDia(dia)}
          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-destaque underline-offset-2 hover:underline"
        >
          Abrir este dia na agenda
          <IconeSeta />
        </Link>
      </div>
    </PainelCentral>
  );
}
