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

/** Margem inferior: revela um pouco antes de a borda entrar na tela. */
const MARGEM_REVELACAO = "0px 0px -8% 0px";

/**
 * Entrada GSAP discreta: o elemento sobe e aparece. O que já está na tela ao
 * montar entra na hora; o que está abaixo da dobra espera a rolagem chegar
 * (uma vez só). IntersectionObserver em vez de ScrollTrigger: posições não
 * ficam velhas quando um bloco em Suspense muda a altura da página.
 *
 * Em movimento reduzido o conteúdo já nasce no estado final.
 */
export function Reveal({ children, delay = 0, y = 16, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefereMovimentoReduzido()) return;

      const entrar = (atraso: number) =>
        gsap.fromTo(
          el,
          { opacity: 0, y },
          {
            opacity: 1,
            y: 0,
            duration: DURACAO.entrada,
            delay: atraso,
            ease: "power3.out",
            // não deixa `transform` inline depois da entrada (evita containing block)
            clearProps: "transform,opacity",
          },
        );

      if (el.getBoundingClientRect().top < window.innerHeight) {
        entrar(delay);
        return;
      }

      gsap.set(el, { opacity: 0, y });
      const obs = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          obs.disconnect();
          entrar(0);
        },
        { rootMargin: MARGEM_REVELACAO },
      );
      obs.observe(el);
      return () => obs.disconnect();
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
