import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RevealProps {
  children: ReactNode;
  /** atraso em escada para itens da mesma sequência (s) */
  delay?: number;
  /** distância de deslocamento vertical inicial (px) */
  y?: number;
  className?: string;
}

/**
 * Entrada discreta: o bloco sobe 16px e aparece em 400ms (classe `.revela`,
 * globals.css). Era GSAP + IntersectionObserver; virou CSS puro — mesmo
 * efeito, sem JavaScript no cliente e sem esperar hidratação para aparecer.
 * Em movimento reduzido o CSS global zera a animação.
 */
export function Reveal({ children, delay = 0, y = 16, className }: RevealProps) {
  const estilo = {
    "--atraso": `${Math.round(delay * 1000)}ms`,
    ...(y !== 16 ? { "--revela-y": `${y}px` } : {}),
  } as CSSProperties;
  return (
    <div className={cn("revela", className)} style={estilo}>
      {children}
    </div>
  );
}
