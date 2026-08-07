import { describe, expect, test } from "vitest";
import {
  dentro,
  diasAte,
  hojeLocal,
  periodoEntre,
  resolverPeriodo,
  somaDias,
} from "@/lib/relatorios/periodo";

// 07/08/2026, 12h em São Paulo.
const AGORA = new Date("2026-08-07T15:00:00Z");

describe("dia no relógio da academia", () => {
  test("usa o fuso de São Paulo, não o do servidor", () => {
    expect(hojeLocal(AGORA)).toBe("2026-08-07");
  });

  test("a virada do dia é à meia-noite daqui, não à do UTC", () => {
    // 02h UTC ainda é ontem, 23h, em São Paulo.
    expect(hojeLocal(new Date("2026-08-08T02:00:00Z"))).toBe("2026-08-07");
    expect(hojeLocal(new Date("2026-08-08T03:00:00Z"))).toBe("2026-08-08");
  });
});

describe("presets", () => {
  test("mês atual vai do dia 1º até hoje e avisa no rótulo", () => {
    const p = resolverPeriodo("mes-atual", undefined, AGORA);
    expect([p.de, p.ate]).toEqual(["2026-08-01", "2026-08-07"]);
    expect(p.rotulo).toBe("Agosto 2026 (até 07/08/2026)");
    expect(p.dias).toBe(7);
  });

  test("mês anterior é o mês fechado, e o rótulo perde o 'até'", () => {
    const p = resolverPeriodo("mes-anterior", undefined, AGORA);
    expect([p.de, p.ate]).toEqual(["2026-07-01", "2026-07-31"]);
    expect(p.rotulo).toBe("Julho 2026");
    expect(p.dias).toBe(31);
  });

  test("últimos 3 meses abrem no dia 1º de dois meses atrás", () => {
    const p = resolverPeriodo("ultimos-3-meses", undefined, AGORA);
    expect([p.de, p.ate]).toEqual(["2026-06-01", "2026-08-07"]);
    expect(p.rotulo).toBe("01/06/2026 a 07/08/2026");
  });

  test("últimos 12 meses atravessam a virada do ano", () => {
    const p = resolverPeriodo("ultimos-12-meses", undefined, AGORA);
    expect(p.de).toBe("2025-09-01");
  });

  test("personalizado inválido cai no mês atual em vez de estourar", () => {
    // Botão que devolve erro por causa de campo vazio é pior que um padrão.
    expect(resolverPeriodo("personalizado", { de: "", ate: "" }, AGORA).de).toBe("2026-08-01");
    expect(resolverPeriodo("personalizado", { de: "2026-08-10", ate: "2026-08-01" }, AGORA).de).toBe(
      "2026-08-01",
    );
    expect(resolverPeriodo("personalizado", { de: "2026-02-30", ate: "2026-03-01" }, AGORA).de).toBe(
      "2026-08-01",
    );
  });

  test("personalizado válido é respeitado", () => {
    const p = resolverPeriodo("personalizado", { de: "2026-01-15", ate: "2026-03-10" }, AGORA);
    expect(p.rotulo).toBe("15/01/2026 a 10/03/2026");
    expect(p.dias).toBe(55);
  });
});

describe("o que cai dentro do período", () => {
  const julho = periodoEntre("2026-07-01", "2026-07-31");

  test("pagamento da noite do último dia continua sendo do mês", () => {
    // 22h de 31/07 em São Paulo é gravado como 01/08 em UTC. Sem o ajuste de
    // fuso, o fechamento de julho perderia a venda.
    expect(dentro(julho, "2026-08-01T01:00:00.000Z")).toBe(true);
    expect(dentro(julho, "2026-08-01T03:00:00.000Z")).toBe(false);
  });

  test("a madrugada do primeiro dia entra", () => {
    expect(dentro(julho, "2026-07-01T03:00:00.000Z")).toBe(true);
    expect(dentro(julho, "2026-07-01T02:59:00.000Z")).toBe(false);
  });

  test("campo vazio ou lixo nunca entra", () => {
    expect(dentro(julho, undefined)).toBe(false);
    expect(dentro(julho, "")).toBe(false);
    expect(dentro(julho, "ontem")).toBe(false);
  });
});

describe("atraso até o fechamento", () => {
  const julho = periodoEntre("2026-07-01", "2026-07-31");

  test("conta do vencimento até o último dia do período", () => {
    expect(diasAte(julho, "2026-06-20T00:00:00.000Z")).toBe(41);
  });

  test("vencer no último dia não é atraso", () => {
    expect(diasAte(julho, "2026-07-31T00:00:00.000Z")).toBe(0);
  });
});

test("somaDias atravessa mês e ano sem depender do fuso", () => {
  expect(somaDias("2026-07-31", 1)).toBe("2026-08-01");
  expect(somaDias("2026-01-01", -1)).toBe("2025-12-31");
  expect(somaDias("2028-02-28", 1)).toBe("2028-02-29");
});
