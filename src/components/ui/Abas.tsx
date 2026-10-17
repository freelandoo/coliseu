"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { comParametro, lerEnum } from "@/lib/navegacao";

/**
 * Estado de apresentação endereçável: `?chave=valor` na URL.
 *
 * Usa `history.pushState`, que o Next sincroniza com `useSearchParams` sem ir
 * ao servidor nem remontar a página. Uma entrada por ativação (nunca por
 * tecla), então Voltar/Avançar percorre as seções e o refresh volta na mesma.
 * Valor inválido = padrão; o padrão some da URL; os outros parâmetros ficam.
 */
export function useParametroUrl<T extends string>(
  chave: string,
  aceitos: readonly T[],
  padrao: T,
): [T, (valor: T) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const valor = lerEnum(params.get(chave), aceitos, padrao);
  const definir = useCallback(
    (novo: T) => {
      if (novo === lerEnum(new URLSearchParams(window.location.search).get(chave), aceitos, padrao)) return;
      const busca = comParametro(window.location.search.slice(1), chave, novo, padrao);
      window.history.pushState(null, "", `${pathname}${busca}`);
    },
    [chave, aceitos, padrao, pathname],
  );
  return [valor, definir];
}

export interface AbaDef<T extends string> {
  chave: T;
  rotulo: string;
  /** Ex.: contador ao lado do rótulo. */
  extra?: ReactNode;
}

/**
 * Tabs de painéis locais (mesma página). Ativação manual: setas, Home e End
 * movem o foco; Enter/Espaço (o clique do botão) troca o painel. Assim um
 * painel com carga própria não é montado só por passar o foco por ele.
 */
export function ListaAbas<T extends string>({
  rotulo,
  abas,
  ativa,
  onAtivar,
  idBase,
}: {
  rotulo: string;
  abas: readonly AbaDef<T>[];
  ativa: T;
  onAtivar: (chave: T) => void;
  idBase: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const atual = refs.current.findIndex((b) => b === document.activeElement);
    if (atual === -1) return;
    const ultimo = abas.length - 1;
    const destino =
      e.key === "ArrowRight" ? (atual === ultimo ? 0 : atual + 1)
      : e.key === "ArrowLeft" ? (atual === 0 ? ultimo : atual - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? ultimo
      : null;
    if (destino === null) return;
    e.preventDefault();
    refs.current[destino]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={rotulo}
      onKeyDown={aoTeclar}
      className="flex max-w-full overflow-x-auto border-b border-border"
    >
      {abas.map((a, i) => {
        const selecionada = a.chave === ativa;
        return (
          <button
            key={a.chave}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-aba-${a.chave}`}
            aria-selected={selecionada}
            aria-controls={`${idBase}-painel-${a.chave}`}
            tabIndex={selecionada ? 0 : -1}
            onClick={() => onAtivar(a.chave)}
            className={cn(
              "-mb-px flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              selecionada
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:border-border-strong hover:text-ink",
            )}
          >
            {a.rotulo}
            {a.extra}
          </button>
        );
      })}
    </div>
  );
}

/** Só o painel ativo é montado (os outros não carregam nem rodam efeitos). */
export function PainelAba({
  idBase,
  chave,
  children,
}: {
  idBase: string;
  chave: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-painel-${chave}`}
      aria-labelledby={`${idBase}-aba-${chave}`}
      tabIndex={0}
      className="rounded-lg outline-none focus-visible:outline-2"
    >
      {children}
    </div>
  );
}

/** Id estável para ligar abas e painéis. */
export function useIdAbas(): string {
  return useId().replace(/:/g, "");
}
