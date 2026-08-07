import { describe, expect, test } from "vitest";
import {
  agruparPorData,
  diasNoMes,
  gradeDoMes,
  mesDaData,
  mesDeslocado,
  rotuloMes,
  semanasDoMes,
} from "@/lib/calendario";

describe("grade do mês", () => {
  test("abre no domingo e fecha no sábado, em semanas inteiras", () => {
    // 01/08/2026 é um sábado: a primeira semana traz 26/07 a 31/07 atrás.
    const grade = gradeDoMes(2026, 8);
    expect(grade.length % 7).toBe(0);
    expect(grade[0].data).toBe("2026-07-26");
    expect(grade[grade.length - 1].data).toBe("2026-09-05");
  });

  test("marca a sobra do mês vizinho para a grade poder apagá-la", () => {
    const grade = gradeDoMes(2026, 8);
    expect(grade[0]).toEqual({ data: "2026-07-26", dia: 26, doMes: false });
    expect(grade.find((d) => d.data === "2026-08-01")).toEqual({
      data: "2026-08-01",
      dia: 1,
      doMes: true,
    });
    expect(grade.filter((d) => d.doMes)).toHaveLength(31);
  });

  test("cobre o mês sem repetir nem pular dia", () => {
    const grade = gradeDoMes(2026, 2);
    const doMes = grade.filter((d) => d.doMes).map((d) => d.data);
    expect(doMes[0]).toBe("2026-02-01");
    expect(doMes.at(-1)).toBe("2026-02-28");
    expect(new Set(grade.map((d) => d.data)).size).toBe(grade.length);
  });

  test("fevereiro que começa no domingo cabe em 4 linhas", () => {
    // 01/02/2015 foi domingo e o mês teve 28 dias — a grade mínima.
    expect(semanasDoMes(2015, 2)).toBe(4);
    expect(gradeDoMes(2015, 2)).toHaveLength(28);
    // E o caso oposto: mês de 31 dias começando no sábado precisa de 6 linhas.
    expect(semanasDoMes(2026, 8)).toBe(6);
  });

  test("não escorrega no horário de verão", () => {
    // Outubro/2026: a virada do horário de verão de São Paulo já não existe,
    // mas a conta é em UTC de propósito — somar 24h nunca cai no mesmo dia.
    const grade = gradeDoMes(2026, 10);
    const doMes = grade.filter((d) => d.doMes);
    expect(doMes.map((d) => d.dia)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });
});

describe("dias no mês", () => {
  test("conhece o calendário, inclusive bissexto", () => {
    expect(diasNoMes(2026, 1)).toBe(31);
    expect(diasNoMes(2026, 2)).toBe(28);
    expect(diasNoMes(2028, 2)).toBe(29);
    expect(diasNoMes(2026, 4)).toBe(30);
  });
});

describe("navegação de mês", () => {
  test("anda para frente e para trás virando o ano", () => {
    expect(mesDeslocado(2026, 12, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(mesDeslocado(2026, 1, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(mesDeslocado(2026, 8, 0)).toEqual({ ano: 2026, mes: 8 });
    expect(mesDeslocado(2026, 8, -14)).toEqual({ ano: 2025, mes: 6 });
  });

  test("lê o mês da data e escreve o título", () => {
    expect(mesDaData("2026-08-04")).toEqual({ ano: 2026, mes: 8 });
    expect(rotuloMes(2026, 8)).toBe("Agosto 2026");
    expect(rotuloMes(2026, 3)).toBe("Março 2026");
  });
});

describe("agrupamento por dia", () => {
  test("junta o que cai no mesmo dia, na ordem em que chegou", () => {
    const itens = [
      { data: "2026-08-04", id: "a" },
      { data: "2026-08-05", id: "b" },
      { data: "2026-08-04", id: "c" },
    ];
    const mapa = agruparPorData(itens);
    expect(mapa.get("2026-08-04")?.map((i) => i.id)).toEqual(["a", "c"]);
    expect(mapa.get("2026-08-05")?.map((i) => i.id)).toEqual(["b"]);
    // Dia sem nada não vira entrada vazia — a grade pergunta e recebe undefined.
    expect(mapa.get("2026-08-06")).toBeUndefined();
  });
});
