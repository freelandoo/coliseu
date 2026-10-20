"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { iniciais, linkConversa, quandoFoi } from "@/lib/central";
import type { ConversaResumo } from "@/lib/types";
import { CabecaPainel, EstadoBloco, IconeConversa, IconeSeta, PainelCentral } from "@/components/painel/central-ui";

type Filtro = "nao-lidas" | "recentes";

/**
 * Atendimento na central: as conversas com mensagem não lida (filtradas no
 * banco) e as mais recentes, com a última prévia e o acesso direto à conversa.
 *
 * Só lê o resumo — escolher uma conversa aqui NÃO marca nada como lido; quem
 * marca é a abertura da conversa no Atendimento. Também não responde: o envio
 * continua sendo manual, lá.
 *
 * `null` numa lista = falhou ao carregar (não é "nenhuma conversa").
 */
export function CentralAtendimento({
  naoLidas,
  recentes,
  totalMensagens,
  hoje,
  atraso,
}: {
  naoLidas: ConversaResumo[] | null;
  recentes: ConversaResumo[] | null;
  /** soma de mensagens não lidas (o mesmo número do menu) */
  totalMensagens: number | null;
  hoje: string;
  atraso?: number;
}) {
  const [filtro, setFiltro] = useState<Filtro>(naoLidas && naoLidas.length === 0 ? "recentes" : "nao-lidas");
  const lista = filtro === "nao-lidas" ? naoLidas : recentes;
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);
  // A escolha vale enquanto a conversa estiver na lista à vista; senão, a primeira.
  const escolhida = lista?.find((c) => c.id === escolhidaId) ?? lista?.[0] ?? null;

  const filtros: { chave: Filtro; rotulo: string }[] = [
    { chave: "nao-lidas", rotulo: "Não lidas" },
    { chave: "recentes", rotulo: "Recentes" },
  ];

  return (
    <PainelCentral aria-labelledby="central-atendimento" atraso={atraso}>
      <CabecaPainel
        icone={<IconeConversa />}
        titulo="Atendimento agora"
        id="central-atendimento"
        contagem={totalMensagens}
        rotuloContagem={totalMensagens === null ? undefined : `${totalMensagens} mensagens não lidas`}
        acao={
          <Link
            href="/atendimento"
            aria-label="Ver todas as conversas no Atendimento"
            className="group inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-medium text-destaque transition-colors hover:bg-surface-2"
          >
            <span className="hidden sm:inline">Ver todas</span>
            <IconeSeta />
          </Link>
        }
      />

      <div role="group" aria-label="Filtrar conversas" className="mx-5 flex gap-5 border-b border-border">
        {filtros.map((f) => {
          const ativo = filtro === f.chave;
          return (
            <button
              key={f.chave}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(f.chave)}
              className={cn(
                "relative -mb-px min-h-10 border-b-2 pb-2 pt-1 text-sm transition-colors duration-200",
                ativo ? "border-destaque font-semibold text-destaque" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {f.rotulo}
            </button>
          );
        })}
      </div>

      {lista === null ? (
        <EstadoBloco tom="erro" titulo="Não foi possível carregar as conversas agora.">
          A agenda e os números seguem valendo.{" "}
          <Link href="/atendimento" className="font-medium text-destaque underline underline-offset-2">
            Abrir o Atendimento
          </Link>
        </EstadoBloco>
      ) : lista.length === 0 ? (
        <EstadoBloco titulo={filtro === "nao-lidas" ? "Nenhuma mensagem esperando leitura." : "Nenhuma conversa ainda."}>
          {filtro === "nao-lidas" ? "Quando chegar mensagem nova, ela aparece aqui." : null}
        </EstadoBloco>
      ) : (
        <>
          <ul key={filtro} className="cascata flex flex-col gap-0.5 px-2.5 pt-2" aria-label="Conversas">
            {lista.map((c) => {
              const ativa = c.id === escolhida?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => setEscolhidaId(c.id)}
                    className={cn(
                      "grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-2.5 py-2.5 text-left",
                      "transition-colors duration-200",
                      ativa ? "bg-surface-2" : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-sm text-xs font-semibold transition-colors duration-200",
                        ativa ? "bg-acao text-white" : "bg-surface-2 text-ink",
                      )}
                    >
                      {iniciais(c.nome)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{c.nome}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        {c.preview || "Sem prévia de texto"}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5 self-center">
                      <time dateTime={c.ultimaMensagemEm} className="text-xs tabular-nums text-muted">
                        {quandoFoi(c.ultimaMensagemEm, hoje)}
                      </time>
                      {c.naoLidas > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand px-1 text-xs font-semibold tabular-nums text-white">
                          {c.naoLidas}
                          <span className="sr-only"> não lidas</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {escolhida && (
            <div className="mx-5 mt-2 border-t border-border pb-5 pt-4" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
                <span>
                  Prévia · <span className="font-medium text-ink">{escolhida.nome}</span>
                </span>
                <span>Ler aqui não marca como lida</span>
              </div>
              <p
                key={escolhida.id}
                className="troca mt-2.5 rounded-r-lg border-l-2 border-brand bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed text-ink [overflow-wrap:anywhere]"
              >
                {escolhida.preview || "A última mensagem não tem texto (mídia ou figurinha)."}
              </p>
              <Link
                href={linkConversa(escolhida.id)}
                className="group mt-3.5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-acao px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-brand-hover active:scale-[0.98]"
              >
                Abrir conversa
                <IconeSeta />
              </Link>
            </div>
          )}
        </>
      )}
    </PainelCentral>
  );
}
