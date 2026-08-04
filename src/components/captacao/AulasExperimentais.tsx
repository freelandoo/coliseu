"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatarDataCompleta, formatarHora } from "@/lib/aula-experimental";
import type { AulaExperimentalItem } from "@/lib/types";

type Filtro = "hoje" | "proximas" | "todas";

const CHIPS: { key: Filtro; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "proximas", label: "Próximas" },
  { key: "todas", label: "Todas" },
];

/**
 * As aulas experimentais marcadas na conversa.
 *
 * "Hoje" é o filtro que a recepção usa de manhã para saber quem vai aparecer;
 * "Próximas" é a agenda daqui para frente; "Todas" guarda o histórico, inclusive
 * quem marcou e não veio.
 *
 * `hoje` vem pronto do servidor, no fuso da academia — calcular aqui faria o
 * HTML do servidor e o do navegador discordarem sobre que dia é hoje.
 */
export function AulasExperimentais({
  aulas,
  hoje,
}: {
  aulas: AulaExperimentalItem[];
  hoje: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");

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
        : "Nenhuma aula experimental marcada ainda. Marque pela conversa do WhatsApp, no retrátil em cima da caixa de texto.";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {CHIPS.map((chip) => {
          const ativo = filtro === chip.key;
          return (
            <button
              key={chip.key}
              onClick={() => setFiltro(chip.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm",
                ativo
                  ? "border-red/60 bg-red-ghost text-ink"
                  : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
              )}
            >
              <span className="uppercase tracking-wide">{chip.label}</span>
              <span
                className={cn(
                  "flex h-4 min-w-4 items-center justify-center rounded-md px-1 text-[10px] font-semibold sm:h-5 sm:min-w-5 sm:text-xs",
                  ativo ? "bg-red text-white" : "bg-surface-2 text-faint",
                )}
              >
                {contagem[chip.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">{vazio}</p>
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
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <Badge>{a.modalidade}</Badge>
                    <Acoes aula={a} hoje={hoje} />
                  </div>
                </div>
              ))}
            </div>

            {/* desktop: tabela */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <Th>Aluno</Th>
                    <Th>Contato</Th>
                    <Th>Modalidade</Th>
                    <Th>Aula</Th>
                    <Th>Marcada por</Th>
                    <Th className="text-right">Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-surface-2"
                    >
                      <td className="px-4 py-3 font-medium text-ink">{a.nome}</td>
                      <td className="px-4 py-3 text-muted">{a.telefone}</td>
                      <td className="px-4 py-3">
                        <Badge>{a.modalidade}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <QuandoEtiqueta aula={a} hoje={hoje} />
                      </td>
                      <td className="px-4 py-3 text-faint">{a.agendadoPor ?? "—"}</td>
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
      </Card>
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
        ehHoje ? "text-red-bright" : passou ? "text-faint" : "text-muted",
      )}
    >
      {ehHoje ? "Hoje" : formatarDataCompleta(aula.data)} · {formatarHora(aula.hora)}
    </span>
  );
}

/**
 * "Não compareceu" abre a conversa da pessoa com o convite para remarcar já
 * escrito na caixa de texto — quem lê e envia é a recepção, como em toda
 * resposta do Coliseu. O botão só existe depois que o dia da aula chegou: até
 * lá não há falta, só aula marcada.
 */
function Acoes({ aula, hoje }: { aula: AulaExperimentalItem; hoje: string }) {
  // Sem conversa não há para onde levar (aula marcada por conversa apagada).
  if (!aula.conversaId) return <span className="text-xs text-faint">sem conversa</span>;

  return (
    <span className="inline-flex items-center gap-3">
      {aula.data <= hoje && (
        <Link
          href={`/atendimento?c=${aula.conversaId}&remarcar=${aula.data}`}
          className="text-xs font-medium text-muted transition-colors hover:text-ink hover:underline"
        >
          Não compareceu
        </Link>
      )}
      <Link
        href={`/atendimento?c=${aula.conversaId}`}
        className="text-xs font-medium text-red-bright hover:underline"
      >
        Conversa →
      </Link>
    </span>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}
