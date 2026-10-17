import { describe, expect, it } from "vitest";
import { gsap } from "gsap";
import { concluirSeReduzido } from "./movimento";

/** Monta uma esteira no formato da matrícula/renovação, sobre objetos simples. */
function esteira(passos: number) {
  const inicios: number[] = [];
  let conclusoes = 0;
  const alvos = Array.from({ length: passos }, () => ({ opacidade: 0.35 }));
  const tl = gsap.timeline({ onComplete: () => conclusoes++ });
  alvos.forEach((alvo, i) => {
    tl.to(
      alvo,
      { opacidade: 1, duration: 0.25, onStart: () => inicios.push(i) },
      i === 0 ? 0 : "+=0.4",
    );
  });
  return { tl, alvos, inicios, conclusoes: () => conclusoes };
}

describe("concluirSeReduzido", () => {
  it("em movimento reduzido conclui a esteira na hora, com cada callback uma única vez", async () => {
    const e = esteira(8);
    concluirSeReduzido(e.tl, true);

    expect(e.inicios).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(e.conclusoes()).toBe(1);
    expect(e.alvos.every((a) => a.opacidade === 1)).toBe(true);

    // nada dispara de novo depois que o tempo da animação original passaria
    await new Promise((r) => setTimeout(r, 120));
    expect(e.conclusoes()).toBe(1);
    expect(e.inicios).toHaveLength(8);
  });

  it("sem preferência de movimento reduzido mantém a animação no ritmo normal", () => {
    const e = esteira(3);
    concluirSeReduzido(e.tl, false);

    expect(e.conclusoes()).toBe(0);
    expect(e.tl.progress()).toBe(0);
    e.tl.kill();
  });
});
