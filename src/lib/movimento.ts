/**
 * Preferência de movimento reduzido, para o que anima por JavaScript (o
 * Coliseu 3D e a malha de fundo). O CSS já zera transições e keyframes nessa
 * preferência (globals.css); o que roda em `requestAnimationFrame` não enxerga
 * essa regra e consulta aqui.
 */

export const CONSULTA_MOVIMENTO_REDUZIDO = "(prefers-reduced-motion: reduce)";

/** Lida no momento da animação; mudar a preferência depois não reexecuta nada. */
export function prefereMovimentoReduzido(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO).matches;
}
