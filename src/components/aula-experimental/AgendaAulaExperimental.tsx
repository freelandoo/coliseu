"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgendaDoDia } from "@/components/aula-experimental/AgendaDoDia";
import { CalendarioAulas, type MesAncora } from "@/components/aula-experimental/CalendarioAulas";
import { ListaAulas, type FiltroAulas } from "@/components/aula-experimental/ListaAulas";
import { HistoricoAulas } from "@/components/aula-experimental/HistoricoAulas";
import type { AgendanteAula } from "@/components/aula-experimental/AgendarAulaBalcao";
import { ListaAbas, PainelAba, useIdAbas, useParametroUrl, type AbaDef } from "@/components/ui/Abas";
import { BarraFerramentas, CartaoIndicador, PainelAngular } from "@/components/ui/editorial";
import {
  formatarDiaMes,
  formatarDiaPorExtenso,
  horaNaAcademia,
  MODALIDADES,
  nomeDoMes,
  somarDias,
} from "@/lib/aula-experimental";
import { mesDaData, mesDeslocado } from "@/lib/calendario";
import { VISOES_AGENDA, type VisaoAgenda } from "@/lib/navegacao";
import type { AulaExperimentalItem, AulaLegadoItem } from "@/lib/types";

/** Janela do terceiro indicador: hoje e os 6 dias seguintes. */
const DIAS_ADIANTE = 7;
const MINUTO = 60_000;

/**
 * A tela de aulas experimentais: indicadores, o mês (ou a lista) e a agenda
 * do dia escolhido.
 *
 * Tudo é contado a partir das mesmas visitas que a tela mostra — com o filtro
 * de modalidade aplicado, os indicadores, a grade, a agenda e a lista mudam
 * juntos. Não há indicador de "confirmadas": o sistema não guarda confirmação
 * (a mensagem é revisada e enviada pela conversa, sem retorno de status).
 *
 * A visão vai na URL (`?visao=lista`). Mês, dia e filtros moram aqui, e não
 * nos painéis: trocar de visão desmonta o painel, mas não perde onde se estava.
 */
export function AgendaAulaExperimental({
  aulas,
  legado,
  agendante,
  hoje,
  diaInicial = hoje,
  horaInicial,
}: {
  aulas: AulaExperimentalItem[];
  /** Planilha antiga (jun–out/2026), só para a aba Histórico. */
  legado: AulaLegadoItem[];
  /** Quem está logado — aparece no "Agendar aula". */
  agendante: AgendanteAula;
  /** Hoje no fuso da academia, calculado no servidor. */
  hoje: string;
  /** Dia que o calendário abre selecionado (`?dia=`, vindo da central). */
  diaInicial?: string;
  /** Hora no fuso da academia, calculada no servidor (o cliente acompanha). */
  horaInicial: number;
}) {
  const [visao, setVisao] = useParametroUrl("visao", VISOES_AGENDA, "calendario");
  const [ancora, setAncora] = useState<MesAncora>(() => mesDaData(diaInicial));
  const [direcao, setDirecao] = useState(0);
  const [selecionado, setSelecionado] = useState(diaInicial);
  // A lista abre no que interessa ao balcão: de hoje em diante.
  const [filtro, setFiltro] = useState<FiltroAulas>("proximas");
  const [modalidade, setModalidade] = useState<string | null>(null);
  const horaAgora = useHoraNaAcademia(horaInicial);
  const idBase = useIdAbas();
  const agendaRef = useRef<HTMLDivElement>(null);

  // Modalidades conhecidas + qualquer outra que exista nos dados (não some nada).
  const modalidades = useMemo(() => {
    const extras = aulas.map((a) => a.modalidade).filter((m) => !(MODALIDADES as readonly string[]).includes(m));
    return [...MODALIDADES, ...Array.from(new Set(extras)).sort()];
  }, [aulas]);

  const visiveis = useMemo(
    () => (modalidade ? aulas.filter((a) => a.modalidade === modalidade) : aulas),
    [aulas, modalidade],
  );

  const fimJanela = somarDias(hoje, DIAS_ADIANTE - 1);
  const indicadores = useMemo(() => {
    const prefixoMes = `${ancora.ano}-${String(ancora.mes).padStart(2, "0")}-`;
    return {
      noMes: visiveis.filter((a) => a.data.startsWith(prefixoMes)).length,
      hoje: visiveis.filter((a) => a.data === hoje).length,
      semana: visiveis.filter((a) => a.data >= hoje && a.data <= fimJanela).length,
    };
  }, [visiveis, ancora, hoje, fimJanela]);
  const sufixoFiltro = modalidade ? ` · ${modalidade}` : "";

  function andarMes(passo: number) {
    setDirecao(passo);
    setAncora((a) => mesDeslocado(a.ano, a.mes, passo));
  }

  function escolherDia(data: string) {
    const alvo = mesDaData(data);
    if (alvo.ano !== ancora.ano || alvo.mes !== ancora.mes) {
      // Saiu do mês (sobra do vizinho ou seta no teclado): a grade acompanha.
      setDirecao(data > selecionado ? 1 : -1);
      setAncora(alvo);
    }
    setSelecionado(data);
  }

  function escolherDiaNoCalendario(data: string, origem: "clique" | "teclado" = "clique") {
    escolherDia(data);
    // No celular a agenda fica acima do calendário: o toque leva a pessoa até ela.
    if (origem === "clique" && window.matchMedia("(max-width: 1023px)").matches) {
      const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() =>
        agendaRef.current?.scrollIntoView({ block: "start", behavior: reduzido ? "auto" : "smooth" }),
      );
    }
  }

  function voltarParaHoje() {
    const alvo = mesDaData(hoje);
    setDirecao(alvo.ano * 12 + alvo.mes >= ancora.ano * 12 + ancora.mes ? 1 : -1);
    setAncora(alvo);
    setSelecionado(hoje);
  }

  const abas: AbaDef<VisaoAgenda>[] = [
    { chave: "calendario", rotulo: "Calendário" },
    {
      chave: "lista",
      rotulo: "Lista",
      // Só aparece quando tem gente marcada para hoje — alguém vai bater na porta.
      extra:
        indicadores.hoje > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center bg-brand px-1 text-xs font-semibold tabular-nums text-white">
            {indicadores.hoje}
            <span className="sr-only"> hoje</span>
          </span>
        ) : undefined,
    },
    { chave: "historico", rotulo: "Histórico" },
  ];

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <section aria-label="Indicadores" className="grid gap-2 sm:grid-cols-3 sm:gap-4">
        <CartaoIndicador
          numero="01"
          rotulo={`Agendadas em ${nomeDoMes(ancora.mes)}`}
          periodo={`mês do calendário · ${ancora.ano}${sufixoFiltro}`}
          estado={{ tipo: "ok", valor: indicadores.noMes }}
          className="entrada"
        />
        <CartaoIndicador
          numero="02"
          rotulo="Visitas hoje"
          periodo={`${formatarDiaPorExtenso(hoje)}${sufixoFiltro}`}
          estado={{ tipo: "ok", valor: indicadores.hoje }}
          className="entrada [--atraso:50ms]"
        />
        <CartaoIndicador
          numero="03"
          rotulo="Próximos 7 dias"
          periodo={`${formatarDiaMes(hoje)} a ${formatarDiaMes(fimJanela)}, com hoje${sufixoFiltro}`}
          estado={{ tipo: "ok", valor: indicadores.semana }}
          className="entrada [--atraso:100ms]"
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(19rem,1fr)] lg:gap-6">
        {/* No celular a agenda vem primeiro; o calendário fica a um toque abaixo. */}
        <div
          ref={agendaRef}
          className="entrada order-1 scroll-mt-[calc(var(--altura-topo)+var(--safe-t)+1rem)] [--atraso:150ms] lg:order-2"
        >
          <AgendaDoDia
            aulas={visiveis}
            dia={selecionado}
            hoje={hoje}
            horaAgora={horaAgora}
            modalidade={modalidade}
            agendante={agendante}
          />
        </div>

        <PainelAngular
          tom="escuro"
          aria-label="Agenda do mês"
          className="entrada order-2 p-3 [--atraso:100ms] sm:p-5 lg:order-1"
        >
          <BarraFerramentas className="mb-4 border-b border-border">
            <div className="-mb-px min-w-0">
              <ListaAbas rotulo="Visões da agenda" abas={abas} ativa={visao} onAtivar={setVisao} idBase={idBase} />
            </div>
            <label className="mb-2 flex items-center gap-2 text-xs text-muted">
              Modalidade
              <select
                value={modalidade ?? ""}
                onChange={(e) => setModalidade(e.target.value || null)}
                className="min-h-9 border border-control bg-painel-2 px-2.5 text-sm text-ink transition-[border-color] duration-150 hover:border-ink"
              >
                <option value="">Todas</option>
                {modalidades.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </BarraFerramentas>

          <PainelAba idBase={idBase} chave={visao}>
            {visao === "calendario" ? (
              <CalendarioAulas
                aulas={visiveis}
                hoje={hoje}
                ancora={ancora}
                direcao={direcao}
                selecionado={selecionado}
                onEscolherDia={escolherDiaNoCalendario}
                onAndarMes={andarMes}
                onHoje={voltarParaHoje}
              />
            ) : visao === "lista" ? (
              <ListaAulas aulas={visiveis} hoje={hoje} filtro={filtro} setFiltro={setFiltro} />
            ) : (
              <HistoricoAulas aulas={visiveis} legado={legado} hoje={hoje} />
            )}
          </PainelAba>
        </PainelAngular>
      </div>
    </div>
  );
}

/** A hora no relógio da academia, conferida a cada minuto (o status da agenda depende dela). */
function useHoraNaAcademia(inicial: number): number {
  const [hora, setHora] = useState(inicial);
  useEffect(() => {
    const t = setInterval(() => setHora(horaNaAcademia()), MINUTO);
    return () => clearInterval(t);
  }, []);
  return hora;
}
