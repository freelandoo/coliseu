"use client";

import { useState } from "react";
import { CalendarioAulas, type MesAncora } from "@/components/aula-experimental/CalendarioAulas";
import { ListaAulas, type FiltroAulas } from "@/components/aula-experimental/ListaAulas";
import { ListaAbas, PainelAba, useIdAbas, useParametroUrl, type AbaDef } from "@/components/ui/Abas";
import { mesDaData } from "@/lib/calendario";
import { VISOES_AGENDA, type VisaoAgenda } from "@/lib/navegacao";
import type { AulaExperimentalItem } from "@/lib/types";

/**
 * As duas leituras da mesma agenda.
 *
 * O calendário abre primeiro porque é a pergunta de quem está com a pessoa na
 * linha: "que dias já estão cheios?" — o mês inteiro de uma vez, sem abrir dia
 * por dia. A lista continua a um clique, para quem quer a leitura corrida com
 * filtro e histórico.
 *
 * A visão vai na URL (`?visao=lista`). Mês, dia e filtro moram aqui, e não nos
 * painéis: trocar de visão desmonta o painel, mas não perde onde se estava.
 */
export function AulaExperimentalAbas({
  aulas,
  hoje,
}: {
  aulas: AulaExperimentalItem[];
  /** Hoje no fuso da academia, calculado no servidor. */
  hoje: string;
}) {
  const [visao, setVisao] = useParametroUrl("visao", VISOES_AGENDA, "calendario");
  const [ancora, setAncora] = useState<MesAncora>(() => mesDaData(hoje));
  const [selecionado, setSelecionado] = useState(hoje);
  const [filtro, setFiltro] = useState<FiltroAulas>("todas");
  const idBase = useIdAbas();
  const aulasHoje = aulas.filter((a) => a.data === hoje).length;

  const abas: AbaDef<VisaoAgenda>[] = [
    { chave: "calendario", rotulo: "Calendário" },
    {
      chave: "lista",
      rotulo: "Lista",
      // O badge só aparece quando tem gente marcada para hoje — é o aviso
      // de que alguém vai bater na porta.
      extra:
        aulasHoje > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand px-1 text-xs font-semibold text-white">
            {aulasHoje}
            <span className="sr-only"> hoje</span>
          </span>
        ) : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ListaAbas rotulo="Visões da agenda" abas={abas} ativa={visao} onAtivar={setVisao} idBase={idBase} />
      <PainelAba idBase={idBase} chave={visao}>
        {visao === "calendario" ? (
          <CalendarioAulas
            aulas={aulas}
            hoje={hoje}
            ancora={ancora}
            setAncora={setAncora}
            selecionado={selecionado}
            setSelecionado={setSelecionado}
          />
        ) : (
          <ListaAulas aulas={aulas} hoje={hoje} filtro={filtro} setFiltro={setFiltro} />
        )}
      </PainelAba>
    </div>
  );
}
