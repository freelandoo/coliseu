"use client";

import { IconeFechar } from "@/components/captacao/icones";
import { MensagemErro } from "@/components/ui/Campo";
import { cn } from "@/lib/cn";
import { ORDEM_BANDEIRAS } from "@/lib/whatsapp/busca";
import { INTERESSE_LABEL, type ConversaInteresse } from "@/lib/types";
import { PONTO } from "./visual";

/**
 * Abas Pessoas/Grupos. Grupo costuma falar muito mais que lead: sem separar, a
 * conversa de quem quer matrícula afundaria embaixo da conversa de grupo.
 */
export function AbaBotao({
  ativa,
  label,
  quantidade,
  naoLidas,
  onClick,
}: {
  ativa: boolean;
  label: string;
  quantidade: number;
  naoLidas: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={cn(
        "flex min-h-10 flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold transition-colors",
        ativa ? "border-b-2 border-brand bg-brand-soft text-ink" : "text-muted hover:text-ink",
      )}
    >
      {label}
      <span className="text-xs font-normal text-faint">{quantidade}</span>
      {naoLidas > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded bg-brand px-1 text-xs font-semibold text-white">
          {naoLidas}
          <span className="sr-only"> não lidas</span>
        </span>
      )}
    </button>
  );
}

/**
 * Barra de bandeiras em cima da busca: uma bolinha por estágio, na cor que o
 * estágio já tem em todo o sistema, com quantas conversas estão nele.
 *
 * Marca mais de uma para juntar estágios (qualificado + com interesse é a fila
 * de quem vale ligar hoje), e clicar de novo desmarca.
 */
export function BarraBandeiras({
  contagem,
  ativas,
  onAlternar,
  onLimpar,
}: {
  contagem: Record<ConversaInteresse, number>;
  ativas: ConversaInteresse[];
  onAlternar: (bandeira: ConversaInteresse) => void;
  onLimpar: () => void;
}) {
  return (
    <div role="group" aria-label="Filtrar por estágio" className="mb-2 flex flex-wrap items-center gap-1">
      {ORDEM_BANDEIRAS.map((bandeira) => {
        const ativa = ativas.includes(bandeira);
        return (
          <button
            key={bandeira}
            type="button"
            onClick={() => onAlternar(bandeira)}
            aria-pressed={ativa}
            title={`${INTERESSE_LABEL[bandeira]} · ${contagem[bandeira]}`}
            aria-label={`Filtrar por ${INTERESSE_LABEL[bandeira]} — ${contagem[bandeira]} conversa(s)`}
            className={cn(
              "flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
              ativa
                ? "border-brand/60 bg-brand-soft text-ink"
                : "border-border text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", PONTO[bandeira])} />
            {contagem[bandeira]}
          </button>
        );
      })}
      {ativas.length > 0 && (
        <button
          type="button"
          onClick={onLimpar}
          className="min-h-7 rounded-full px-2 py-0.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
        >
          Todas
        </button>
      )}
    </div>
  );
}

/** Campo de busca com o estado da busca no servidor dito, não adivinhado. */
export function CampoBusca({
  busca,
  onBusca,
  quantos,
  buscando,
  falhou,
}: {
  busca: string;
  onBusca: (v: string) => void;
  /** Resultados visíveis na aba atual. */
  quantos: number;
  buscando: boolean;
  falhou: boolean;
}) {
  const termo = busca.trim();
  return (
    <>
      <div className="relative">
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          type="search"
          placeholder="Nome, telefone ou palavra…"
          aria-label="Buscar conversa por nome, telefone ou palavra do histórico"
          className="min-h-9 w-full rounded-lg border border-control bg-surface px-3 py-1.5 pr-8 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-brand sm:text-sm"
        />
        {busca && (
          <button
            type="button"
            onClick={() => onBusca("")}
            aria-label="Limpar busca"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-faint transition-colors hover:text-ink"
          >
            <IconeFechar />
          </button>
        )}
      </div>
      <p role="status" className="mt-1.5 min-h-4 text-xs text-faint">
        {termo.length === 1
          ? "Digite mais uma letra para procurar no histórico."
          : buscando
            ? "Procurando em todas as conversas…"
            : falhou
              ? ""
              : termo
                ? `${quantos} resultado${quantos === 1 ? "" : "s"}`
                : ""}
      </p>
      {falhou && (
        <MensagemErro className="text-xs">
          A busca no servidor falhou. Mostrando só o que já estava carregado.
        </MensagemErro>
      )}
    </>
  );
}
