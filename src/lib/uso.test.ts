import { describe, expect, test } from "vitest";
import {
  CAUDA_ATIVIDADE_MS,
  SLOT_MS,
  comoFalarDoInstante,
  ehPeriodo,
  estimarTempoAtivo,
  formatarDuracao,
  inicioDoDia,
  inicioDoSlot,
  intervaloPeriodo,
  somarDias,
} from "@/lib/uso";

const MIN = 60_000;
/** 10h da manhã de São Paulo (UTC-3) num dia qualquer, como instante. */
const BASE = Date.UTC(2026, 7, 6, 13, 0, 0);

describe("inicioDoSlot", () => {
  test("cai sempre no começo do bloco de cinco minutos", () => {
    expect(inicioDoSlot(Date.UTC(2026, 7, 6, 13, 7, 42)).toISOString()).toBe(
      "2026-08-06T13:05:00.000Z",
    );
    expect(inicioDoSlot(new Date(Date.UTC(2026, 7, 6, 13, 5, 0))).toISOString()).toBe(
      "2026-08-06T13:05:00.000Z",
    );
  });

  test("instantes do mesmo bloco viram o mesmo slot — é o que dedupe a batida", () => {
    const a = inicioDoSlot(Date.UTC(2026, 7, 6, 13, 0, 1));
    const b = inicioDoSlot(Date.UTC(2026, 7, 6, 13, 4, 59));
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("estimarTempoAtivo", () => {
  test("sem ação nenhuma, não inventa tempo", () => {
    expect(estimarTempoAtivo([])).toBe(0);
  });

  test("uma ação sozinha vale a cauda — nunca zero", () => {
    expect(estimarTempoAtivo([BASE])).toBe(CAUDA_ATIVIDADE_MS);
  });

  test("ações seguidas viram um bloco só", () => {
    // 10h00, 10h10, 10h20 — nenhum buraco maior que a folga.
    const ms = estimarTempoAtivo([BASE, BASE + 10 * MIN, BASE + 20 * MIN]);
    expect(ms).toBe(20 * MIN + CAUDA_ATIVIDADE_MS);
  });

  test("buraco grande quebra em dois blocos, e a tarde não emenda na manhã", () => {
    // Manhã: 10h00 → 10h30. Tarde: 15h00 → 15h10.
    const ms = estimarTempoAtivo([
      BASE,
      BASE + 30 * MIN,
      BASE + 300 * MIN,
      BASE + 310 * MIN,
    ]);
    expect(ms).toBe(30 * MIN + CAUDA_ATIVIDADE_MS + 10 * MIN + CAUDA_ATIVIDADE_MS);
  });

  test("ordem de chegada não importa e instante repetido não conta duas vezes", () => {
    const embaralhado = estimarTempoAtivo([BASE + 20 * MIN, BASE, BASE + 10 * MIN, BASE]);
    expect(embaralhado).toBe(20 * MIN + CAUDA_ATIVIDADE_MS);
  });

  test("a folga é configurável — e o limite não quebra o bloco", () => {
    const noLimite = estimarTempoAtivo([BASE, BASE + 10 * MIN], { gapMs: 10 * MIN });
    expect(noLimite).toBe(10 * MIN + CAUDA_ATIVIDADE_MS);
    const passouDoLimite = estimarTempoAtivo([BASE, BASE + 11 * MIN], { gapMs: 10 * MIN });
    expect(passouDoLimite).toBe(2 * CAUDA_ATIVIDADE_MS);
  });
});

describe("formatarDuracao", () => {
  test("fala como a recepção fala", () => {
    expect(formatarDuracao(0)).toBe("—");
    expect(formatarDuracao(40 * MIN)).toBe("40min");
    expect(formatarDuracao(2 * 60 * MIN)).toBe("2h");
    expect(formatarDuracao(135 * MIN)).toBe("2h 15min");
  });

  test("tempo abaixo de um minuto não vira '0min'", () => {
    expect(formatarDuracao(20_000)).toBe("—");
  });
});

describe("comoFalarDoInstante", () => {
  const agora = new Date(BASE);
  const atras = (ms: number) => new Date(BASE - ms).toISOString();

  test("idade em uma palavra", () => {
    expect(comoFalarDoInstante(null, agora)).toBe("—");
    expect(comoFalarDoInstante(atras(30_000), agora)).toBe("agora");
    expect(comoFalarDoInstante(atras(15 * MIN), agora)).toBe("há 15min");
    expect(comoFalarDoInstante(atras(3 * 60 * MIN), agora)).toBe("há 3h");
    expect(comoFalarDoInstante(atras(26 * 60 * MIN), agora)).toBe("ontem");
    expect(comoFalarDoInstante(atras(3 * 24 * 60 * MIN), agora)).toBe("há 3 dias");
  });
});

describe("período", () => {
  test("só aceita os períodos que a tela oferece", () => {
    expect(ehPeriodo("7d")).toBe(true);
    expect(ehPeriodo("ontem")).toBe(false);
    expect(ehPeriodo(7)).toBe(false);
  });

  test("somarDias atravessa a virada do mês", () => {
    expect(somarDias("2026-08-06", -6)).toBe("2026-07-31");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  test("o dia começa à meia-noite de São Paulo, não à de UTC", () => {
    // Sem fuso, 2026-08-06 começaria às 00h UTC — três horas antes do balcão.
    expect(inicioDoDia("2026-08-06").toISOString()).toBe("2026-08-06T03:00:00.000Z");
  });

  test("'hoje' às 21h de sábado ainda é sábado — a régua é o relógio da academia", () => {
    // 2026-08-08 23h30 em São Paulo já é 2026-08-09 em UTC.
    const agora = new Date(Date.UTC(2026, 7, 9, 2, 30));
    const { inicio, fim } = intervaloPeriodo("hoje", agora);
    expect(inicio.toISOString()).toBe("2026-08-08T03:00:00.000Z");
    expect(fim).toBe(agora);
  });

  test("as janelas incluem o dia de hoje inteiro", () => {
    const agora = new Date(Date.UTC(2026, 7, 6, 13, 0));
    expect(intervaloPeriodo("7d", agora).inicio.toISOString()).toBe("2026-07-31T03:00:00.000Z");
    expect(intervaloPeriodo("30d", agora).inicio.toISOString()).toBe("2026-07-08T03:00:00.000Z");
    expect(intervaloPeriodo("mes", agora).inicio.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  test("o bloco de presença cabe inteiro dentro da janela do dia", () => {
    const { inicio } = intervaloPeriodo("hoje", new Date(Date.UTC(2026, 7, 6, 13, 0)));
    expect(inicio.getTime() % SLOT_MS).toBe(0);
  });
});
