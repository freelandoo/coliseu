/**
 * Política de movimento compartilhada pelas animações GSAP.
 *
 * O CSS já zera transições/keyframes em `prefers-reduced-motion` (globals.css),
 * mas o GSAP anima por JavaScript e não enxerga essa regra. Cada animação
 * consulta esta preferência e apresenta o estado final sem deslocamento.
 *
 * Atenção: algumas timelines carregam o fluxo de negócio no `onComplete`
 * (MatriculaFlow chama `finalizar()`, RenovarModal libera a venda). Nesses
 * casos NUNCA pule a timeline com `return` — use `concluirSeReduzido`, que leva
 * a timeline ao fim e dispara cada callback uma única vez, na mesma ordem.
 */

export const CONSULTA_MOVIMENTO_REDUZIDO = "(prefers-reduced-motion: reduce)";

/** Durações (s) para GSAP — curtas, sem atrasar a disponibilidade das ações. */
export const DURACAO = {
  curta: 0.15,
  media: 0.25,
  entrada: 0.4,
} as const;

/** Lida no momento da animação; mudar a preferência depois não reexecuta nada. */
export function prefereMovimentoReduzido(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(CONSULTA_MOVIMENTO_REDUZIDO).matches;
}

/** O mínimo que precisamos de uma timeline GSAP (facilita testar sem DOM). */
interface Concluivel {
  progress(valor: number): unknown;
}

/**
 * Em movimento reduzido, salta a timeline para o estado final. O salto dispara
 * os `onStart` dos passos e o `onComplete` da timeline exatamente uma vez,
 * de forma síncrona — então efeitos que dependem do fim da animação seguem
 * acontecendo, sem chamadas duplicadas.
 */
export function concluirSeReduzido<T extends Concluivel>(
  timeline: T,
  reduzido: boolean = prefereMovimentoReduzido(),
): T {
  if (reduzido) timeline.progress(1);
  return timeline;
}
