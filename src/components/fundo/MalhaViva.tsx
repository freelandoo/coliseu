"use client";

import { useEffect, useRef } from "react";
import { prefereMovimentoReduzido } from "@/lib/movimento";
import type { CenaMalha, IntensidadeMalha } from "./cena-malha";

/** Atributo em <html> enquanto o canvas desenha a malha (o CSS esconde a dele). */
export const ATRIBUTO_MALHA_VIVA = "data-malha-viva";

interface MalhaVivaProps {
  /** "baixa" em telas de trabalho (quase só a linha); "alta" em telas de abertura. */
  intensidade?: IntensidadeMalha;
}

/**
 * Malha viva do fundo: as casas da malha de 48px acendem perto do cursor
 * (com rastro curto), uma onda de luz cruza a tela de tempos em tempos e
 * casas soltas pulsam devagar. No toque, o dedo solta um anel.
 *
 * A cena (three + shader TSL, WebGPU com fallback WebGL2) chega por import
 * dinâmico. Enquanto não desenha — ou se não iniciar — a malha estática do
 * `body::after` segue no lugar; depois do primeiro quadro, o canvas marca
 * `data-malha-viva` em <html> e o CSS esconde a dele (as linhas coincidem).
 *
 * Em movimento reduzido nada é montado. Trocar `intensidade` só anima um
 * uniform: o renderer não é recriado.
 */
export function MalhaViva({ intensidade = "baixa" }: MalhaVivaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<CenaMalha | null>(null);
  // a cena nasce com a intensidade do momento em que terminar de carregar
  const intensidadeRef = useRef(intensidade);

  useEffect(() => {
    intensidadeRef.current = intensidade;
    cenaRef.current?.definirIntensidade(intensidade);
  }, [intensidade]);

  useEffect(() => {
    const container = ref.current;
    if (!container || prefereMovimentoReduzido()) return;

    let cancelado = false;
    let cena: CenaMalha | null = null;
    const raiz = document.documentElement;

    import("./cena-malha")
      .then(({ criarCenaMalha }) =>
        criarCenaMalha(container, {
          intensidade: intensidadeRef.current,
          aoPrimeiroQuadro: () => {
            if (!cancelado) raiz.setAttribute(ATRIBUTO_MALHA_VIVA, "");
          },
          aoFalhar: () => raiz.removeAttribute(ATRIBUTO_MALHA_VIVA),
        }),
      )
      .then((criada) => {
        // desmontou durante o carregamento (StrictMode ou navegação rápida)
        if (cancelado) {
          criada.destruir();
          return;
        }
        cena = criada;
        cenaRef.current = criada;
        criada.definirIntensidade(intensidadeRef.current);
      })
      .catch(() => {
        // sem WebGPU nem WebGL2: a malha estática do CSS continua
      });

    return () => {
      cancelado = true;
      cena?.destruir();
      if (cenaRef.current === cena) cenaRef.current = null;
      raiz.removeAttribute(ATRIBUTO_MALHA_VIVA);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -1 }}
    />
  );
}
