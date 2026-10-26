import { describe, expect, test } from "vitest";
import { barraTreino, combinaFiltroApp, situacaoTreino, treinoVencido } from "@/lib/freelandoo/rotulos";

const AGORA = new Date("2026-10-20T12:00:00Z");
const emDias = (d: number) => new Date(AGORA.getTime() + d * 86_400_000).toISOString();

describe("barraTreino", () => {
  test("sem treino", () => {
    expect(barraTreino(null, 60, AGORA)).toEqual({ situacao: "sem_treino", proporcao: 0, diasRestantes: null, texto: "Sem treino" });
  });

  test("proporção = dias restantes ÷ validade", () => {
    const b = barraTreino(emDias(30), 60, AGORA);
    expect(b).toMatchObject({ situacao: "em_dia", diasRestantes: 30, texto: "Treino vence em 30 dias" });
    expect(b.proporcao).toBeCloseTo(0.5);
  });

  test("perto do fim avisa (≤ 20% da validade)", () => {
    expect(barraTreino(emDias(5), 30, AGORA).situacao).toBe("vencendo");
    expect(barraTreino(emDias(1), 30, AGORA).texto).toBe("Treino vence em 1 dia");
  });

  test("vencido: barra zerada e texto de alerta", () => {
    expect(barraTreino(emDias(-3), 60, AGORA)).toMatchObject({ situacao: "vencido", proporcao: 0, texto: "Treino vencido há 3 dias" });
    expect(barraTreino(AGORA.toISOString(), 60, AGORA).texto).toBe("Treino venceu hoje");
  });

  test("validade ausente usa o padrão de 60 dias; nunca passa de 100%", () => {
    expect(barraTreino(emDias(30), null, AGORA).proporcao).toBeCloseTo(0.5);
    expect(barraTreino(emDias(120), 90, AGORA).proporcao).toBe(1);
  });

  test("data inválida = sem treino", () => {
    expect(barraTreino("não é data", 60, AGORA).situacao).toBe("sem_treino");
  });
});

describe("filtros da lista", () => {
  test("Na Freelandoo = ativa ou aguardando aceite", () => {
    expect(combinaFiltroApp({ estado: "ativa" }, "na_freelandoo", AGORA)).toBe(true);
    expect(combinaFiltroApp({ estado: "aguardando_aceite" }, "na_freelandoo", AGORA)).toBe(true);
    expect(combinaFiltroApp({ estado: "falta_dado" }, "na_freelandoo", AGORA)).toBe(false);
  });

  test("Sem conta inclui quem não tem o resumo", () => {
    expect(combinaFiltroApp(undefined, "sem_conta", AGORA)).toBe(true);
    expect(combinaFiltroApp({ estado: "ativa" }, "sem_conta", AGORA)).toBe(false);
  });

  test("Treino vencido só conta conta ativa com treino vencido", () => {
    expect(combinaFiltroApp({ estado: "ativa", treinoVenceEm: emDias(-1) }, "treino_vencido", AGORA)).toBe(true);
    expect(combinaFiltroApp({ estado: "ativa", treinoVenceEm: emDias(10) }, "treino_vencido", AGORA)).toBe(false);
    expect(combinaFiltroApp({ estado: "ativa" }, "treino_vencido", AGORA)).toBe(false);
    expect(treinoVencido(emDias(-1), AGORA)).toBe(true);
  });
});

describe("situacaoTreino (aba Treinos)", () => {
  test("vencido, vencendo, sem treino e em dia", () => {
    expect(situacaoTreino({ estado: "ativa", treinoVenceEm: emDias(-2), treinoValidadeDias: 60 }, AGORA)).toBe("vencido");
    expect(situacaoTreino({ estado: "ativa", treinoVenceEm: emDias(5), treinoValidadeDias: 60 }, AGORA)).toBe("vencendo");
    expect(situacaoTreino({ estado: "aguardando_aceite" }, AGORA)).toBe("sem_treino");
    expect(situacaoTreino({ estado: "ativa", treinoVenceEm: emDias(40), treinoValidadeDias: 60 }, AGORA)).toBeNull();
  });

  test("ficha do professor esperando o aluno sai da cobrança", () => {
    expect(situacaoTreino({ estado: "ativa", treinoVenceEm: emDias(-30), treinoPropostaPendente: true }, AGORA)).toBe(
      "aguardando_aluno",
    );
  });

  test("sem conta na Freelandoo não tem onde receber treino", () => {
    expect(situacaoTreino(undefined, AGORA)).toBe("sem_conta");
    expect(situacaoTreino({ estado: "falta_dado" }, AGORA)).toBe("sem_conta");
  });
});
