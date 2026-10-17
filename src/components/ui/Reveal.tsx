"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DURACAO, prefereMovimentoReduzido } from "@/lib/movimento";

interface RevealProps {
  children: ReactNode;
  /** atraso em escada para itens da mesma sequência */
  delay?: number;
  /** distância de deslocamento vertical inicial (px) */
  y?: number;
  className?: string;
}

/**
 * Entrada GSAP discreta: o elemento sobe pouco e aparece ao montar. Uma
 * sequência por seção — sem micro-motion decorativo. Em movimento reduzido o
 * conteúdo já nasce no estado final (sem deslocamento nem atraso).
 */
export function Reveal({ children, delay = 0, y = 10, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefereMovimentoReduzido()) return;
      gsap.from(ref.current, {
        opacity: 0,
        y,
        duration: DURACAO.entrada,
        delay,
        ease: "power3.out",
        // não deixa `transform` inline depois da entrada (evita containing block)
        clearProps: "transform",
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
