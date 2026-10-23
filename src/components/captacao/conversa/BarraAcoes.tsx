"use client";

import type { ReactNode } from "react";
import { Bandeira } from "@/components/ui/Bandeira";
import { Botao } from "@/components/ui/Botao";
import { cn } from "@/lib/cn";
import { INTERESSE_LABEL, type ConversaInteresse, type ConversaResumo, type LeadEstagio } from "@/lib/types";

/**
 * As 5 flags de classificação, na ordem do funil (a mesma das abas da
 * Captação). Um toque na bandeira classifica — sem gaveta, sem formulário.
 * Classificar como "Convertido" não matricula ninguém: matrícula é outra
 * operação, com revisão e confirmação próprias.
 */
const FLAGS: { interesse: ConversaInteresse; estagio: LeadEstagio }[] = [
  { interesse: "nao_classificado", estagio: "novo" },
  { interesse: "sem_interesse", estagio: "qualificado" },
  { interesse: "com_interesse", estagio: "interesse" },
  { interesse: "convertido", estagio: "convertido" },
  { interesse: "perdido", estagio: "perdido" },
];

/** Abre/fecha uma gaveta logo acima da caixa de resposta. */
function BotaoGaveta({ aberto, onClick, children }: { aberto: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberto}
      className="flex min-h-8 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
    >
      {children}
      <span aria-hidden className={cn("text-xs transition-transform", aberto && "rotate-180")}>
        ▼
      </span>
    </button>
  );
}

/** Faixa acima do histórico: classificar, gavetas de texto pronto e administração. */
export function BarraAcoes({
  conversa,
  podeResponder,
  podeApagar,
  classificando,
  onClassificar,
  mostrandoRespostas,
  onAlternarRespostas,
  mostrandoAula,
  onAlternarAula,
  onConfirmar,
}: {
  conversa: ConversaResumo;
  podeResponder: boolean;
  podeApagar: boolean;
  classificando: boolean;
  onClassificar: (interesse: ConversaInteresse) => void;
  mostrandoRespostas: boolean;
  onAlternarRespostas: () => void;
  mostrandoAula: boolean;
  onAlternarAula: () => void;
  onConfirmar: (tipo: "limpar" | "remover") => void;
}) {
  if (!podeApagar && !podeResponder && conversa.ehGrupo) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {!conversa.ehGrupo && (
          <div className="flex items-center gap-0.5" role="group" aria-label="Classificar lead">
            {FLAGS.map((f) => {
              const ativa = conversa.interesse === f.interesse;
              return (
                <button
                  type="button"
                  key={f.interesse}
                  onClick={() => onClassificar(f.interesse)}
                  disabled={classificando}
                  title={INTERESSE_LABEL[f.interesse]}
                  aria-label={`Classificar como ${INTERESSE_LABEL[f.interesse]}`}
                  aria-pressed={ativa}
                  className={cn(
                    "rounded-md p-1.5 transition-all",
                    ativa ? "bg-surface-2 ring-1 ring-border-strong" : "opacity-40 hover:opacity-90 focus-visible:opacity-100",
                    classificando && "cursor-wait",
                  )}
                >
                  <Bandeira estagio={f.estagio} />
                </button>
              );
            })}
          </div>
        )}
        {podeResponder && (
          <BotaoGaveta aberto={mostrandoRespostas} onClick={onAlternarRespostas}>
            Respostas prontas
          </BotaoGaveta>
        )}
        {podeResponder && !conversa.ehGrupo && (
          <BotaoGaveta aberto={mostrandoAula} onClick={onAlternarAula}>
            Aula experimental
          </BotaoGaveta>
        )}
      </div>
      {podeApagar && (
        <div className="flex items-center gap-1">
          <Botao variante="discreto" tamanho="sm" onClick={() => onConfirmar("limpar")}>
            Limpar
          </Botao>
          <Botao variante="discreto" tamanho="sm" onClick={() => onConfirmar("remover")} className="hover:text-danger">
            Remover
          </Botao>
        </div>
      )}
    </div>
  );
}
