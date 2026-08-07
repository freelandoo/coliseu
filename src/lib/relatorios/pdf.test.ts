import { describe, expect, test } from "vitest";
import {
  DocumentoPdf,
  cortarTexto,
  escaparTexto,
  larguraTexto,
  paraWinAnsi,
  quebrarTexto,
} from "@/lib/relatorios/pdf";

describe("codificação", () => {
  test("acento vira byte WinAnsi, não some", () => {
    expect(paraWinAnsi("ção")).toEqual([0xe7, 0xe3, 0x6f]);
  });

  test("travessão e reticências saem da faixa alta do WinAnsi", () => {
    expect(paraWinAnsi("–…")).toEqual([0x96, 0x85]);
  });

  test("caractere sem equivalente vira '?' visível, não buraco", () => {
    expect(paraWinAnsi("🏋")).toEqual([0x3f]);
  });

  test("parêntese e barra são escapados — senão fecham a string do PDF", () => {
    expect(escaparTexto("(R$ 10) \\ mês")).toBe("\\(R$ 10\\) \\\\ m\\352s");
  });

  test("todo byte alto sai em octal, o arquivo inteiro fica ASCII", () => {
    expect(/^[\x20-\x7e]*$/.test(escaparTexto("Inadimplência · 12,5% – ação"))).toBe(true);
  });
});

describe("métricas da Helvetica", () => {
  test("letra acentuada mede o mesmo que a letra de base", () => {
    // Na Helvetica o acento fica por cima, não ao lado.
    expect(larguraTexto("ação", 10)).toBeCloseTo(larguraTexto("acao", 10), 5);
  });

  test("negrito é mais largo que o regular", () => {
    expect(larguraTexto("Matrículas", 10, true)).toBeGreaterThan(larguraTexto("Matrículas", 10));
  });

  test("largura escala com o corpo da fonte", () => {
    expect(larguraTexto("abc", 20)).toBeCloseTo(larguraTexto("abc", 10) * 2, 5);
  });

  test("espaço tem largura, string vazia não", () => {
    expect(larguraTexto("", 10)).toBe(0);
    expect(larguraTexto(" ", 10)).toBeCloseTo(2.78, 5);
  });
});

describe("corte e quebra", () => {
  test("o que cabe passa intacto", () => {
    expect(cortarTexto("Mensalidade", 200, 8)).toBe("Mensalidade");
  });

  test("o que não cabe volta com reticências e dentro da largura", () => {
    const cortado = cortarTexto("Mensalidade de dezembro do plano anual", 40, 8);
    expect(cortado.endsWith("…")).toBe(true);
    expect(larguraTexto(cortado, 8)).toBeLessThanOrEqual(40);
  });

  test("nenhuma linha quebrada estoura a largura pedida", () => {
    const texto =
      "Cada real investido em captação volta 2,4 vezes em mensalidade ao longo da vida do aluno.";
    const linhas = quebrarTexto(texto, 180, 8.5);
    expect(linhas.length).toBeGreaterThan(1);
    for (const linha of linhas) expect(larguraTexto(linha, 8.5)).toBeLessThanOrEqual(180);
    expect(linhas.join(" ")).toBe(texto);
  });

  test("palavra sozinha maior que a linha é cortada, não empurra a margem", () => {
    const [linha] = quebrarTexto("supercalifragilisticoespialidoso", 40, 8);
    expect(larguraTexto(linha, 8)).toBeLessThanOrEqual(40);
  });
});

describe("documento", () => {
  function documentoDeExemplo() {
    const doc = new DocumentoPdf({ titulo: "Relatório de Marketing", criadoEm: new Date("2026-08-07T15:00:00Z") });
    doc.texto(40, 60, "Relatório de Marketing", { tamanho: 21, negrito: true });
    doc.retangulo(40, 100, 200, 12, [0.66, 0.16, 0.14]);
    doc.linha(40, 130, 500, 130, [0.85, 0.86, 0.88]);
    doc.novaPagina();
    doc.texto(40, 60, "Inadimplência · 12,5%", { alinhamento: "direita" });
    return doc;
  }

  test("sai um PDF que abre: cabeçalho, xref e fim de arquivo", () => {
    const pdf = documentoDeExemplo().finalizar();
    const texto = pdf.toString("latin1");
    expect(texto.startsWith("%PDF-1.4\n")).toBe(true);
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(texto).toContain("/Type /Catalog");
    expect(texto).toContain("/Count 2");
  });

  test("cada posição da xref aponta mesmo para o começo do objeto", () => {
    // É o que quebra silenciosamente se um byte alto escapar do escape: o
    // leitor abre em branco sem dizer por quê.
    const pdf = documentoDeExemplo().finalizar();
    const texto = pdf.toString("latin1");
    const inicioXref = Number(/startxref\n(\d+)/.exec(texto)?.[1]);
    const tabela = texto.slice(inicioXref);
    const total = Number(/xref\n0 (\d+)/.exec(tabela)?.[1]);
    const posicoes = [...tabela.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));

    expect(posicoes).toHaveLength(total - 1);
    posicoes.forEach((posicao, i) => {
      expect(texto.slice(posicao, posicao + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });

  test("o /Length do conteúdo bate com o stream escrito", () => {
    const pdf = documentoDeExemplo().finalizar().toString("latin1");
    for (const [, declarado, stream] of pdf.matchAll(
      /<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g,
    )) {
      expect(stream.length).toBe(Number(declarado));
    }
  });

  test("o rodapé roda uma vez por página e conhece o total", () => {
    const doc = documentoDeExemplo();
    const chamadas: string[] = [];
    doc.finalizar((pagina, total) => {
      chamadas.push(`${pagina}/${total}`);
      doc.texto(40, 800, `Página ${pagina} de ${total}`, { tamanho: 7 });
    });
    expect(chamadas).toEqual(["1/2", "2/2"]);
  });

  test("acento no texto não vaza byte alto para o arquivo", () => {
    const pdf = new DocumentoPdf();
    pdf.texto(40, 40, "Inadimplência · Renovação — 12,5%");
    const bytes = pdf.finalizar();
    expect(bytes.every((b) => b < 128)).toBe(true);
    expect(bytes.toString("latin1")).toContain("Inadimpl\\352ncia");
  });

  test("alinhar à direita põe o fim do texto na coordenada pedida", () => {
    const doc = new DocumentoPdf();
    doc.texto(500, 40, "R$ 1.234,00", { alinhamento: "direita", tamanho: 10 });
    const stream = doc.finalizar().toString("latin1");
    const x = Number(/1 0 0 1 ([\d.]+) /.exec(stream)?.[1]);
    expect(x + larguraTexto("R$ 1.234,00", 10)).toBeCloseTo(500, 1);
  });
});
