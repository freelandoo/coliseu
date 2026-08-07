import { describe, expect, test } from "vitest";
import JSZip from "jszip";
import { nomeBase, paraCsv, planilhasEmZip } from "@/lib/relatorios/planilha";
import { periodoEntre } from "@/lib/relatorios/periodo";
import type { Relatorio } from "@/lib/relatorios/tipos";

const JULHO = periodoEntre("2026-07-01", "2026-07-31");

const RELATORIO: Relatorio = {
  tipo: "marketing",
  titulo: "Relatório de Marketing",
  periodo: "Julho 2026",
  geradoEm: "01/08/2026 09:00",
  geradoPor: "Alex",
  observacoes: ["Safra é quem entrou no período."],
  blocos: [],
  planilhas: [
    {
      nome: "reativacao",
      titulo: "Base de reativação",
      colunas: ["Nome", "Telefone"],
      linhas: [["João Ferreira", "(11) 90000-0000"]],
    },
    {
      nome: "ausentes",
      titulo: "Ausentes",
      colunas: ["Nome", "Dias"],
      linhas: [],
    },
  ],
};

describe("csv para quem abre no Excel", () => {
  test("separa por ponto e vírgula e começa com BOM", () => {
    // Vírgula joga a linha inteira numa célula no Excel em português.
    const csv = paraCsv(["Nome", "Valor"], [["Ana", "100,00"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Nome;Valor\r\nAna;100,00");
  });

  test("célula com separador, aspas ou quebra de linha vai entre aspas", () => {
    const csv = paraCsv(["A"], [["Luz; água"], ['Disse "não"'], ["duas\nlinhas"]]);
    expect(csv).toContain('"Luz; água"');
    expect(csv).toContain('"Disse ""não"""');
    expect(csv).toContain('"duas\nlinhas"');
  });

  test("célula comum não ganha aspas à toa", () => {
    expect(paraCsv(["A"], [["simples"]])).toContain("A\r\nsimples");
  });
});

test("o nome do arquivo carrega tipo e período", () => {
  expect(nomeBase("financeiro", JULHO)).toBe("coliseu-financeiro-2026-07-01-a-2026-07-31");
});

describe("zip das listas", () => {
  test("traz um csv por lista e um LEIA-ME que datou o recorte", async () => {
    // A planilha viaja solta por WhatsApp; sem o LEIA-ME ninguém lembra de
    // qual mês era a lista duas semanas depois.
    const zip = await JSZip.loadAsync(await planilhasEmZip(RELATORIO, JULHO));
    expect(Object.keys(zip.files).sort()).toEqual([
      "coliseu-marketing-2026-07-01-a-2026-07-31-LEIA-ME.txt",
      "coliseu-marketing-2026-07-01-a-2026-07-31-ausentes.csv",
      "coliseu-marketing-2026-07-01-a-2026-07-31-reativacao.csv",
    ]);

    const leiame = await zip.file("coliseu-marketing-2026-07-01-a-2026-07-31-LEIA-ME.txt")!.async("string");
    expect(leiame).toContain("Julho 2026");
    expect(leiame).toContain("Base de reativação (1 linha(s))");
    expect(leiame).toContain("LGPD");
  });

  test("lista vazia vira arquivo só com cabeçalho, não some do pacote", () => {
    // Sumir daria a impressão de erro de exportação; cabeçalho sozinho diz
    // "conferi e não tem ninguém".
    return planilhasEmZip(RELATORIO, JULHO)
      .then((b) => JSZip.loadAsync(b))
      .then((zip) => zip.file("coliseu-marketing-2026-07-01-a-2026-07-31-ausentes.csv")!.async("string"))
      .then((csv) => expect(csv).toContain("Nome;Dias"));
  });
});
