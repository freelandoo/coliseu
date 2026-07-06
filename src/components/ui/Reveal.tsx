"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

interface RevealProps {
  children: ReactNode;
  /** atraso em escada para itens da mesma sequência */
  delay?: number;
  /** distância de deslocamento vertical inicial (px) */
  y?: number;
  className?: string;
}

/**
 * Entrada GSAP discreta e de alto impacto: o elemento sobe e revela ao
 * entrar na viewport. Uma sequência por seção — sem micro-motion decorativo.
 */
export function Reveal({ children, delay = 0, y = 18, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.from(ref.current, {
        opacity: 0,
        y,
        duration: 0.6,
        delay,
        ease: "power3.out",
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
