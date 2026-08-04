"use client";

import { useState } from "react";
import { LeadsFiltro } from "@/components/captacao/LeadsFiltro";
import { AulasExperimentais } from "@/components/captacao/AulasExperimentais";
import { cn } from "@/lib/cn";
import type { AulaExperimentalItem, Lead, Plano } from "@/lib/types";

type Aba = "leads" | "aulas";

/**
 * As duas leituras da Captação: o funil de leads e a agenda de aulas
 * experimentais. São listas com regras próprias (uma filtra por estágio, a
 * outra por data), então cada uma fica na sua aba em vez de virar mais um chip
 * na mesma barra de filtros.
 */
export function CaptacaoAbas({
  leads,
  planos,
  aulas,
  hoje,
}: {
  leads: Lead[];
  planos: Plano[];
  aulas: AulaExperimentalItem[];
  /** Hoje no fuso da academia, calculado no servidor. */
  hoje: string;
}) {
  const [aba, setAba] = useState<Aba>("leads");
  const aulasHoje = aulas.filter((a) => a.data === hoje).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex border-b border-border">
        <AbaBotao ativa={aba === "leads"} onClick={() => setAba("leads")} label="Leads" />
        <AbaBotao
          ativa={aba === "aulas"}
          onClick={() => setAba("aulas")}
          label="Aula experimental"
          // O badge só aparece quando tem gente marcada para hoje — é o aviso
          // de que alguém vai bater na porta.
          badge={aulasHoje > 0 ? aulasHoje : undefined}
        />
      </div>

      {aba === "leads" ? (
        <LeadsFiltro leads={leads} planos={planos} />
      ) : (
        <AulasExperimentais aulas={aulas} hoje={hoje} />
      )}
    </div>
  );
}

function AbaBotao({
  ativa,
  label,
  badge,
  onClick,
}: {
  ativa: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 font-display text-[11px] font-semibold uppercase tracking-widest transition-colors sm:text-xs",
        ativa ? "border-b-2 border-red text-ink" : "text-faint hover:text-muted",
      )}
    >
      {label}
      {badge !== undefined && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded bg-red px-1 text-[10px] font-semibold tracking-normal text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
