"use client";

import type { RefObject } from "react";
import { Botao } from "@/components/ui/Botao";
import { MensagemErro } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import { trechoAoRedor } from "@/lib/whatsapp/busca";
import { temRascunho } from "@/lib/whatsapp/rascunhos";
import { INTERESSE_LABEL } from "@/lib/types";
import { PONTO, quando, type LinhaConversa } from "./visual";

function ItemConversa({
  conversa: c,
  ativo,
  rascunho,
  termo,
  onAbrir,
}: {
  conversa: LinhaConversa;
  ativo: boolean;
  rascunho: boolean;
  termo: string;
  onAbrir: () => void;
}) {
  return (
    <li
      className={cn(
        "border-b border-border transition-colors last:border-0",
        ativo ? "bg-brand-soft" : "hover:bg-surface-2",
      )}
    >
      <button
        type="button"
        data-conversa-id={c.id}
        onClick={onAbrir}
        aria-current={ativo ? "true" : undefined}
        className="flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-left"
      >
        <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", PONTO[c.interesse])} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-ink">{c.nome}</span>
            <span className="shrink-0 text-xs text-faint">{quando(c.ultimaMensagemEm)}</span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted">
              {rascunho ? <span className="font-semibold text-destaque">Rascunho · </span> : null}
              {c.trecho ? trechoAoRedor(c.trecho, termo) : c.preview || c.telefone}
            </span>
            {c.naoLidas > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-brand px-1 text-xs font-semibold text-white">
                {c.naoLidas}
                <span className="sr-only"> não lidas</span>
              </span>
            )}
          </span>
          {!c.ehGrupo && c.interesse !== "nao_classificado" && (
            <span className="mt-1 block text-xs text-faint">{INTERESSE_LABEL[c.interesse]}</span>
          )}
        </span>
      </button>
    </li>
  );
}

/** O que dizer quando a lista visível está vazia — cada motivo tem sua frase. */
function motivoVazio({
  termo,
  buscando,
  falhou,
  grupos,
  comBandeiras,
}: {
  termo: string;
  buscando: boolean;
  falhou: boolean;
  grupos: boolean;
  comBandeiras: boolean;
}) {
  if (termo) {
    if (buscando) return "Procurando em todas as conversas…";
    if (falhou) return "Nada na lista carregada. A busca completa falhou — tente de novo em instantes.";
    return `Nada encontrado para “${termo}”${comBandeiras ? " nas bandeiras marcadas" : ""}. A busca cobre nome, telefone e o que foi escrito nas conversas.`;
  }
  if (grupos) {
    return "Nenhum grupo por aqui ainda. O grupo entra nesta aba na primeira mensagem nova que chegar nele — conversa anterior não é importada.";
  }
  if (comBandeiras) {
    return "Nenhuma conversa nas bandeiras marcadas. Desmarque (ou toque em “Todas”) para ver a lista inteira.";
  }
  return "Nenhuma conversa individual carregada.";
}

/** As conversas da aba, com "Carregar mais" no fim quando não há busca. */
export function ListaConversas({
  listaRef,
  visiveis,
  selecionada,
  termo,
  buscando,
  falhou,
  grupos,
  comBandeiras,
  proximo,
  carregandoMais,
  erroMais,
  onCarregarMais,
  onAbrir,
  onEntrar,
  onSair,
}: {
  listaRef: RefObject<HTMLUListElement | null>;
  visiveis: LinhaConversa[];
  selecionada: string | null;
  termo: string;
  buscando: boolean;
  falhou: boolean;
  grupos: boolean;
  comBandeiras: boolean;
  proximo: string | null;
  carregandoMais: boolean;
  erroMais: string;
  onCarregarMais: () => void;
  onAbrir: (id: string) => void;
  /** Ponteiro ou foco entraram: a ordem congela até sair. */
  onEntrar: () => void;
  onSair: () => void;
}) {
  return (
    <ul
      ref={listaRef}
      aria-label="Conversas"
      onPointerEnter={onEntrar}
      onPointerLeave={onSair}
      onFocus={onEntrar}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onSair();
      }}
      className="flex-1 overflow-y-auto"
    >
      {visiveis.length === 0 && (
        <li className="px-4 py-10 text-center text-sm text-muted">
          {motivoVazio({ termo, buscando, falhou, grupos, comBandeiras })}
        </li>
      )}
      {visiveis.map((c) => (
        <ItemConversa
          key={c.id}
          conversa={c}
          ativo={c.id === selecionada}
          rascunho={c.id !== selecionada && temRascunho(c.id)}
          termo={termo}
          onAbrir={() => onAbrir(c.id)}
        />
      ))}
      {!termo && proximo && (
        <li className="px-3 py-3">
          <Botao bloco tamanho="sm" onClick={onCarregarMais} carregando={carregandoMais}>
            {carregandoMais ? "Carregando…" : "Carregar mais conversas"}
          </Botao>
          {erroMais && <MensagemErro className="mt-2 text-xs">{erroMais}</MensagemErro>}
        </li>
      )}
    </ul>
  );
}
