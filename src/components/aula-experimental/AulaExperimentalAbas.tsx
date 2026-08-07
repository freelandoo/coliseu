"use client";

import { useState } from "react";
import { CalendarioAulas } from "@/components/aula-experimental/CalendarioAulas";
import { ListaAulas } from "@/components/aula-experimental/ListaAulas";
import { cn } from "@/lib/cn";
import type { AulaExperimentalItem } from "@/lib/types";

type Aba = "calendario" | "lista";

/**
 * As duas leituras da mesma agenda.
 *
 * O calendário abre primeiro porque é a pergunta de quem está com a pessoa na
 * linha: "que dias já estão cheios?" — o mês inteiro de uma vez, sem abrir dia
 * por dia. A lista continua a um clique, para quem quer a leitura corrida com
 * filtro e histórico.
 */
export function AulaExperimentalAbas({
  aulas,
  hoje,
}: {
  aulas: AulaExperimentalItem[];
  /** Hoje no fuso da academia, calculado no servidor. */
  hoje: string;
}) {
  const [aba, setAba] = useState<Aba>("calendario");
  const aulasHoje = aulas.filter((a) => a.data === hoje).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex border-b border-border">
        <AbaBotao
          ativa={aba === "calendario"}
          onClick={() => setAba("calendario")}
          label="Calendário"
        />
        <AbaBotao
          ativa={aba === "lista"}
          onClick={() => setAba("lista")}
          label="Lista"
          // O badge só aparece quando tem gente marcada para hoje — é o aviso
          // de que alguém vai bater na porta.
          badge={aulasHoje > 0 ? aulasHoje : undefined}
        />
      </div>

      {aba === "calendario" ? (
        <CalendarioAulas aulas={aulas} hoje={hoje} />
      ) : (
        <ListaAulas aulas={aulas} hoje={hoje} />
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
