"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/**
 * Modal que sobrepõe a página inteira.
 *
 * O portal para `document.body` não é detalhe de estilo, é o que faz funcionar:
 * qualquer ancestral com `transform` vira containing block e faz `position:
 * fixed` se comportar como `absolute`, prendendo o modal dentro do container.
 * O `Reveal` (GSAP `from` com `y`) deixa um transform inline em toda seção das
 * páginas, então todo modal renderizado dentro dele ficava preso e cortado.
 *
 * Centraliza com `m-auto` em vez de `items-center`: com conteúdo mais alto que a
 * viewport, `items-center` empurra o topo para fora da tela e ele fica
 * inalcançável — não dá nem para rolar até ele. Com margem automática o
 * excedente vira scroll normal do backdrop.
 */
export function Modal({
  children,
  onFechar,
  className,
}: {
  children: ReactNode;
  onFechar: () => void;
  /** Ajustes do diálogo (largura, alinhamento do texto). */
  className?: string;
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    // Trava o scroll do fundo para a roda do mouse rolar o modal, não a página.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = anterior;
    };
  }, [onFechar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex overflow-y-auto bg-black/70 p-4" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "m-auto w-full max-w-md rounded-xl border border-border bg-surface p-6",
          "shadow-[var(--shadow-plate)]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
