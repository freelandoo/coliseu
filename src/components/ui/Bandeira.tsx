import { cn } from "@/lib/cn";
import type { LeadEstagio } from "@/lib/types";

/**
 * Cor da bandeira de cada estágio do funil — a mesma em todo o sistema:
 * abas da Captação, tabela de leads e flags de classificação da conversa.
 */
export const BANDEIRA_COR: Record<LeadEstagio, string> = {
  novo: "text-white",
  qualificado: "text-info",
  interesse: "text-warn",
  convertido: "text-ok",
  perdido: "text-red-bright",
};

/**
 * Bandeirinha do estágio, em forma de marcador (bookmark): retângulo com o
 * recorte em V embaixo, só contorno. Cor via currentColor — sobrescreva com
 * className.
 */
export function Bandeira({
  estagio,
  className,
}: {
  estagio: LeadEstagio;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      aria-hidden
      className={cn("shrink-0", BANDEIRA_COR[estagio], className)}
    >
      <path
        d="M4.5 2.3h7v11.4L8 10.6l-3.5 3.1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
