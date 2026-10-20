"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArenaWireframe } from "@/components/aula-experimental/ArenaWireframe";
import { cn } from "@/lib/cn";
import { CONSULTA_MOVIMENTO_REDUZIDO, prefereMovimentoReduzido } from "@/lib/movimento";
import type { Intensidade } from "./cena";

interface Coliseu3DProps {
  /** O chamador dimensiona a caixa; o componente a preenche. */
  className?: string;
  /** "destaque": brilho cheio e varredura (login, painel). "discreto": cabeçalhos. */
  intensidade?: Intensidade;
}

/**
 * Coliseu holográfico em 3D — decorativo.
 *
 * Cadeia de fallback:
 * 1. SSR e primeiro paint: o `ArenaWireframe` (SVG estático, mesma geometria
 *    vista de uma câmera parecida).
 * 2. No cliente, a cena three.js é importada sob demanda (o three fica fora
 *    do pacote principal) e entra em crossfade depois do primeiro quadro.
 *    O WebGPURenderer cai sozinho para WebGL2 quando não há WebGPU.
 * 3. Se nem WebGL2 inicializar (ou o import falhar), o SVG simplesmente fica.
 *
 * O SVG não some de uma vez: enquanto o holograma se constrói por cima ele
 * fica como planta baixa apagada (25%) e só sai quando a construção termina.
 * A cena só nasce quando a caixa entra na tela (`display:none` nunca entra)
 * e para de desenhar fora dela. Se o render falhar no meio, o SVG volta.
 *
 * Em `prefers-reduced-motion` a cena desenha um único quadro, já montado e
 * parado — e a preferência é ouvida ao vivo. Seguro no StrictMode: a
 * montagem dupla aborta a primeira cena.
 */
type Estado = "svg" | "construindo" | "pronto";

function assinarReduzido(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

export function Coliseu3D({ className, intensidade = "destaque" }: Coliseu3DProps) {
  const hospedeiro = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<Estado>("svg");
  const reduzido = useSyncExternalStore(assinarReduzido, prefereMovimentoReduzido, () => false);

  useEffect(() => {
    const el = hospedeiro.current;
    if (!el) return;
    const controle = new AbortController();
    const vivo = () => !controle.signal.aborted;
    let destruir: (() => void) | null = null;

    const iniciar = () =>
      import("./cena")
        .then(({ montarCena }) => {
          if (!vivo()) return null;
          return montarCena(el, {
            intensidade,
            reduzido,
            sinal: controle.signal,
            aoPrimeiroQuadro: () => {
              if (vivo()) setEstado((e) => (e === "svg" ? "construindo" : e));
            },
            aoConstruido: () => {
              if (vivo()) setEstado("pronto");
            },
            aoFalhar: () => {
              if (vivo()) setEstado("svg");
            },
          });
        })
        .then((fim) => {
          if (!fim) return;
          if (!vivo()) fim();
          else destruir = fim;
        })
        .catch(() => {
          // sem WebGPU nem WebGL2 (ou o chunk não carregou): fica o SVG
        });

    // só monta quando aparece pela primeira vez
    const aparecer = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      aparecer.disconnect();
      void iniciar();
    });
    aparecer.observe(el);

    return () => {
      aparecer.disconnect();
      controle.abort();
      destruir?.();
      destruir = null;
      setEstado("svg");
    };
  }, [intensidade, reduzido]);

  return (
    <div aria-hidden className={cn("pointer-events-none relative h-full w-full select-none", className)}>
      <div
        className={cn(
          "absolute inset-[12%] flex items-center justify-center transition-opacity duration-700 ease-out",
          estado === "svg" ? "opacity-100" : estado === "construindo" ? "opacity-25" : "opacity-0",
        )}
      >
        <ArenaWireframe className="h-full w-full" />
      </div>
      <div
        ref={hospedeiro}
        className={cn(
          "absolute inset-0 transition-opacity duration-700 ease-out",
          estado === "svg" ? "opacity-0" : "opacity-100",
        )}
      />
    </div>
  );
}
