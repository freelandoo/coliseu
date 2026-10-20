"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/primitives";
import { EstadoVazio } from "@/components/ui/editorial";
import { cn } from "@/lib/cn";
import { formatarDataCompleta, formatarHora } from "@/lib/aula-experimental";
import type { AulaExperimentalItem } from "@/lib/types";

export type FiltroAulas = "hoje" | "proximas" | "todas";
type Filtro = FiltroAulas;

const CHIPS: { key: Filtro; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "proximas", label: "Próximas" },
  { key: "todas", label: "Todas" },
];

/**
 * As aulas experimentais marcadas na conversa, em lista.
 *
 * É a segunda aba da tela: o calendário mostra o mês e responde "que dias já
 * estão cheios?"; a lista é a leitura corrida, com filtro e histórico.
 *
 * "Hoje" é o filtro que a recepção usa de manhã para saber quem vai aparecer;
 * "Próximas" é a agenda daqui para frente; "Todas" guarda o histórico, inclusive
 * quem marcou e não veio.
 *
 * `hoje` vem pronto do servidor, no fuso da academia — calcular aqui faria o
 * HTML do servidor e o do navegador discordarem sobre que dia é hoje.
 */
export function ListaAulas({
  aulas,
  hoje,
  filtro,
  setFiltro,
}: {
  aulas: AulaExperimentalItem[];
  hoje: string;
  /** Vem de fora: sobrevive à ida ao Calendário e volta. */
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
}) {

  const contagem = useMemo(
    () => ({
      hoje: aulas.filter((a) => a.data === hoje).length,
      proximas: aulas.filter((a) => a.data >= hoje).length,
      todas: aulas.length,
    }),
    [aulas, hoje],
  );

  const visiveis = useMemo(() => {
    if (filtro === "hoje") return aulas.filter((a) => a.data === hoje);
    if (filtro === "proximas") return aulas.filter((a) => a.data >= hoje);
    return aulas;
  }, [aulas, filtro, hoje]);

  const vazio =
    filtro === "hoje"
      ? "Ninguém marcou aula experimental para hoje."
      : filtro === "proximas"
        ? "Nenhuma aula experimental marcada daqui para frente."
        : "Nenhuma aula experimental marcada ainda. Marque pela conversa da pessoa no Atendimento, em “Aula experimental”.";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button type="button"
              key={chip.key}
              onClick={() => setFiltro(chip.key)}
              aria-pressed={ativo}
              className={cn(
                "flex min-h-9 items-center gap-2 border px-3 py-1.5 text-sm font-medium",
                "transition-[background-color,border-color,color,transform] duration-150 ease-padrao active:scale-[0.97]",
                ativo
                  ? "border-brand bg-brand text-white"
                  : "border-control text-muted hover:border-ink hover:text-ink",
              )}
            >
              <span>{chip.label}</span>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center px-1 text-xs font-semibold tabular-nums",
                  ativo ? "bg-white text-brand" : "bg-surface-2 text-ink",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border border-border">
        {visiveis.length === 0 ? (
          <EstadoVazio titulo={vazio} className="m-3 sm:m-4" />
        ) : (
          <>
            {/* mobile: cards empilhados, sem scroll horizontal */}
            <div className="divide-y divide-border sm:hidden">
              {visiveis.map((a) => (
                <div key={a.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{a.nome}</p>
                      <p className="text-xs text-muted">{a.telefone}</p>
                    </div>
                    <QuandoEtiqueta aula={a} hoje={hoje} />
                  </div>
                  {a.observacao && <p className="line-clamp-2 text-xs text-muted">Obs.: {a.observacao}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <Badge>{a.modalidade}</Badge>
                    <Acoes aula={a} hoje={hoje} />
                  </div>
                </div>
              ))}
            </div>

            {/* desktop: tabela */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Pessoa</Th>
                    <Th>Modalidade</Th>
                    <Th>Aula</Th>
                    <Th>Marcada por</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody className="cascata">
                  {visiveis.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border transition-[background-color] duration-150 last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{a.nome}</p>
                        <p className="mt-0.5 whitespace-nowrap text-xs text-muted tabular-nums">{a.telefone}</p>
                        {a.observacao && (
                          <p className="mt-0.5 line-clamp-1 max-w-xs text-xs text-muted" title={a.observacao}>
                            Obs.: {a.observacao}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{a.modalidade}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <QuandoEtiqueta aula={a} hoje={hoje} />
                      </td>
                      <td className="px-4 py-3 text-muted">{a.agendadoPor ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Acoes aula={a} hoje={hoje} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Data e hora da aula; hoje ganha destaque, o que já passou fica apagado. */
function QuandoEtiqueta({ aula, hoje }: { aula: AulaExperimentalItem; hoje: string }) {
  const ehHoje = aula.data === hoje;
  const passou = aula.data < hoje;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
        ehHoje ? "font-semibold text-destaque" : passou ? "text-faint" : "text-ink",
      )}
    >
      {ehHoje ? "Hoje" : formatarDataCompleta(aula.data)} · {formatarHora(aula.hora)}
    </span>
  );
}

/**
 * "Convidar para remarcar" abre a conversa da pessoa com o convite já escrito
 * na caixa de texto — quem lê e envia é a recepção. Não registra falta nem
 * presença (o sistema não guarda comparecimento): é só o atalho para o
 * convite. Aparece a partir do dia da aula.
 */
function Acoes({ aula, hoje }: { aula: AulaExperimentalItem; hoje: string }) {
  // Sem conversa não há para onde levar (aula marcada por conversa apagada).
  if (!aula.conversaId) return <span className="text-xs text-muted">sem conversa</span>;

  return (
    <span className="inline-flex flex-col items-end gap-1 whitespace-nowrap">
      {aula.data <= hoje && (
        <Link
          href={`/atendimento?c=${aula.conversaId}&remarcar=${aula.data}`}
          title="Abre a conversa com um convite pronto para revisar e enviar. Não registra falta."
          className="text-xs font-medium text-muted transition-colors hover:text-ink hover:underline"
        >
          Convidar para remarcar
        </Link>
      )}
      <Link
        href={`/atendimento?c=${aula.conversaId}`}
        className="text-xs font-semibold text-destaque hover:underline"
      >
        Abrir conversa →
      </Link>
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}
