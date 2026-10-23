"use client";

import type { RefObject } from "react";
import { IconeVoltar } from "@/components/captacao/icones";
import { Botao } from "@/components/ui/Botao";
import { cn } from "@/lib/cn";
import { INTERESSE_LABEL, type ConversaResumo } from "@/lib/types";
import { PONTO } from "./visual";

/** Quem é, em cima da conversa — e o acesso à ficha sem sair dela. */
export function CabecalhoConversa({
  conversa,
  tituloRef,
  fichaVisivel,
  fichaAberta,
  onVoltar,
  onAbrirFicha,
}: {
  conversa: ConversaResumo;
  /** Recebe o foco ao abrir a conversa no celular (não a caixa: não abre o teclado). */
  tituloRef: RefObject<HTMLHeadingElement | null>;
  /** Ficha ao lado, em tela larga. */
  fichaVisivel: boolean;
  /** Ficha à vista, ao lado ou em diálogo. */
  fichaAberta: boolean;
  onVoltar: () => void;
  onAbrirFicha: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
      <button
        type="button"
        onClick={onVoltar}
        aria-label="Voltar para as conversas"
        className="-ml-1 rounded-lg p-2 text-muted transition-colors hover:text-ink lg:hidden"
      >
        <IconeVoltar />
      </button>
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[conversa.interesse])} />
      <span className="min-w-0 flex-1">
        <h2 ref={tituloRef} tabIndex={-1} className="block truncate rounded text-sm font-semibold text-ink outline-none">
          {conversa.nome}
        </h2>
        <span className="block truncate text-xs text-muted">
          {conversa.ehGrupo
            ? "Grupo"
            : [conversa.telefone, INTERESSE_LABEL[conversa.interesse]].filter(Boolean).join(" · ")}
        </span>
      </span>
      {conversa.personId && (
        <Botao
          tamanho="sm"
          variante={fichaVisivel ? "contorno" : "secundario"}
          onClick={onAbrirFicha}
          aria-expanded={fichaAberta}
        >
          Ficha
        </Botao>
      )}
    </div>
  );
}
