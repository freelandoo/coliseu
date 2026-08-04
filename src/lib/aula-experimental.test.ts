import { describe, expect, test } from "vitest";
import {
  comoFalarDoDia,
  dataISO,
  diaAnterior,
  ehDataISO,
  ehHora,
  ehModalidade,
  formatarDataCompleta,
  formatarDiaMes,
  hojeNaAcademia,
  HORAS,
  mensagemAulaExperimental,
  mensagemRemarcarAula,
} from "@/lib/aula-experimental";

describe("data como texto", () => {
  test("monta a data com zero à esquerda", () => {
    expect(dataISO(2026, 8, 4)).toBe("2026-08-04");
    expect(dataISO(2026, 12, 25)).toBe("2026-12-25");
  });

  test("recusa dia que não existe no calendário", () => {
    expect(ehDataISO("2026-02-31")).toBe(false);
    expect(ehDataISO("2026-04-31")).toBe(false);
    expect(ehDataISO("2026-13-01")).toBe(false);
    expect(ehDataISO("2026-02-28")).toBe(true);
    // 2028 é bissexto; 2026 não.
    expect(ehDataISO("2028-02-29")).toBe(true);
    expect(ehDataISO("2026-02-29")).toBe(false);
  });

  test("recusa o que não é data", () => {
    expect(ehDataISO("04/08/2026")).toBe(false);
    expect(ehDataISO("2026-8-4")).toBe(false);
    expect(ehDataISO("")).toBe(false);
    expect(ehDataISO(20260804)).toBe(false);
  });

  test("hoje é o dia do relógio da academia, não o de UTC", () => {
    // 02h30 de 05/08 em UTC ainda é a noite de 04/08 em São Paulo: a aula de
    // hoje não pode virar a de ontem para quem está no balcão.
    expect(hojeNaAcademia(new Date("2026-08-05T02:30:00Z"))).toBe("2026-08-04");
    // E o contrário: manhã em UTC já é o mesmo dia lá.
    expect(hojeNaAcademia(new Date("2026-08-04T12:00:00Z"))).toBe("2026-08-04");
  });
});

describe("formatação", () => {
  test("dia/mês para a mensagem e dia/mês/ano para a lista", () => {
    expect(formatarDiaMes("2026-08-04")).toBe("04/08");
    expect(formatarDataCompleta("2026-08-04")).toBe("04/08/2026");
  });
});

describe("validação do que vem do cliente", () => {
  test("só as modalidades da casa", () => {
    expect(ehModalidade("Boxe")).toBe(true);
    expect(ehModalidade("Musculação")).toBe(true);
    expect(ehModalidade("Xadrez")).toBe(false);
    expect(ehModalidade(null)).toBe(false);
  });

  test("hora cheia dentro da grade", () => {
    expect(HORAS[0]).toBe(6);
    expect(HORAS[HORAS.length - 1]).toBe(22);
    expect(ehHora(21)).toBe(true);
    expect(ehHora(5)).toBe(false);
    expect(ehHora(23)).toBe(false);
    expect(ehHora(20.5)).toBe(false);
    expect(ehHora("21")).toBe(false);
  });
});

describe("convite para remarcar quem faltou", () => {
  test("volta um dia inclusive virando o mês e o ano", () => {
    expect(diaAnterior("2026-08-04")).toBe("2026-08-03");
    expect(diaAnterior("2026-08-01")).toBe("2026-07-31");
    expect(diaAnterior("2026-01-01")).toBe("2025-12-31");
    expect(diaAnterior("2028-03-01")).toBe("2028-02-29"); // bissexto
  });

  test("fala do dia como gente fala", () => {
    const hoje = "2026-08-04";
    expect(comoFalarDoDia("2026-08-04", hoje)).toBe("para hoje");
    expect(comoFalarDoDia("2026-08-03", hoje)).toBe("para ontem");
    // Aula de uma semana atrás não pode sair como "ontem".
    expect(comoFalarDoDia("2026-07-28", hoje)).toBe("para o dia 28/07");
  });

  test("monta o convite com o dia certo", () => {
    const texto = mensagemRemarcarAula("2026-08-03", "2026-08-04");
    expect(texto).toContain("aula experimental agendada para ontem, mas não conseguiu comparecer");
    expect(texto.startsWith("Olá! Tudo bem?")).toBe(true);
    expect(texto.endsWith("Ficamos no aguardo. Até breve!")).toBe(true);
  });
});

describe("mensagem de confirmação", () => {
  test("sai no formato combinado com a academia", () => {
    expect(mensagemAulaExperimental({ modalidade: "Boxe", data: "2026-08-04", hora: 21 })).toBe(
      [
        "Sua aula experimental foi agendada com sucesso!",
        "",
        "📅 Data: 04/08",
        "🥋 Modalidade: Boxe",
        "🕐 Horário: 21h",
        "",
        "Estamos felizes em receber você na Academia Coliseu. 💪",
        "",
        "Qualquer dúvida antes da aula, estou à disposição. Nos vemos em breve!",
      ].join("\n"),
    );
  });
});
