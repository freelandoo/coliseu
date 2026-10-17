import { describe, expect, test } from "vitest";
import {
  dataPorExtenso,
  faixaDeDias,
  iniciais,
  linkAgendaDoDia,
  linkConversa,
  mesEAno,
  primeiroNome,
  quandoFoi,
  saudacao,
  somarDias,
} from "@/lib/central";

describe("somarDias", () => {
  test("vira mês e ano", () => {
    expect(somarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("faixaDeDias", () => {
  test("sete dias a partir de hoje, com dia da semana", () => {
    const f = faixaDeDias("2026-10-17");
    expect(f).toHaveLength(7);
    expect(f[0]).toMatchObject({ data: "2026-10-17", semana: "sáb", dia: "17" });
    expect(f[6].data).toBe("2026-10-23");
    expect(f[1].porExtenso).toBe("domingo, 18 de outubro");
  });
});

describe("textos de data", () => {
  test("por extenso e mês/ano", () => {
    expect(dataPorExtenso("2026-10-17")).toBe("sábado, 17 de outubro");
    expect(mesEAno("2026-10-17")).toBe("OUT / 2026");
  });

  test("saudação segue o relógio de São Paulo, não o do servidor", () => {
    // 01:30 UTC de domingo = 22:30 de sábado em São Paulo
    expect(saudacao(new Date("2026-10-18T01:30:00Z"))).toBe("Boa noite");
    expect(saudacao(new Date("2026-10-17T12:00:00Z"))).toBe("Bom dia"); // 9h
    expect(saudacao(new Date("2026-10-17T17:00:00Z"))).toBe("Boa tarde"); // 14h
  });

  test("quandoFoi: hora hoje, ontem, ou dia/mês — no fuso da academia", () => {
    expect(quandoFoi("2026-10-17T12:05:00Z", "2026-10-17")).toBe("09:05");
    // 01:00 UTC do dia 17 ainda é dia 16 em São Paulo
    expect(quandoFoi("2026-10-17T01:00:00Z", "2026-10-17")).toBe("ontem");
    expect(quandoFoi("2026-10-02T15:00:00Z", "2026-10-17")).toBe("02/10");
  });
});

describe("rótulos", () => {
  test("iniciais e primeiro nome", () => {
    expect(iniciais("Maria da Silva")).toBe("MD");
    expect(iniciais("+55 11 90000-0000")).toBe("#");
    expect(iniciais("Érica")).toBe("É");
    expect(primeiroNome("  Alex Rodrigues ")).toBe("Alex");
  });

  test("links levam às telas existentes com o contexto", () => {
    expect(linkConversa("abc_1")).toBe("/atendimento?c=abc_1");
    expect(linkAgendaDoDia("2026-10-20")).toBe("/aula-experimental?dia=2026-10-20");
  });
});
