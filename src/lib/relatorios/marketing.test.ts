import { describe, expect, test } from "vitest";
import { relatorioMarketing, mesDiaNascimento } from "@/lib/relatorios/marketing";
import { periodoEntre } from "@/lib/relatorios/periodo";
import type { DadosRelatorio } from "@/lib/relatorios/dados";
import type { Bloco, Indicador, Relatorio } from "@/lib/relatorios/tipos";
import type { Despesa, Pessoa, Plano } from "@/lib/types";

const JULHO = periodoEntre("2026-07-01", "2026-07-31");
const CTX = { geradoPor: "Alex", agora: new Date("2026-08-01T12:00:00Z") };

const MENSAL: Plano = { id: "pl-mensal", nome: "Mensal", valorMensal: 120, duracaoDias: 30 };

/** O R$ do Intl vem com espaço fino; comparar texto exige normalizar. */
const limpo = (s: string) => s.replace(/[  ]/g, " ");

function pessoa(over: Partial<Pessoa> & { id: string }): Pessoa {
  return {
    codigo: `CD${over.id}`,
    nome: `Pessoa ${over.id}`,
    telefone: "11900000000",
    origem: "whatsapp",
    fase: "lead",
    estagio: "novo",
    criadoEm: "2026-07-05T12:00:00.000Z",
    ...over,
  };
}

function despesa(over: Partial<Despesa> & { id: string }): Despesa {
  return { categoria: "Luz", valor: 100, data: "2026-07-03T12:00:00.000Z", ...over };
}

/**
 * Julho: quatro leads captados (dois de WhatsApp, um de redes que se perdeu,
 * um de indicação), um deles fechou matrícula; um aluno antigo na base e um
 * cancelamento para dar vida média. R$ 300 de marketing e R$ 200 de luz.
 */
function base(): DadosRelatorio {
  return {
    planos: [MENSAL],
    cobrancas: [],
    aulas: [],
    pessoas: [
      pessoa({
        id: "A",
        origem: "whatsapp",
        fase: "aluno",
        estagio: "convertido",
        criadoEm: "2026-07-05T12:00:00.000Z",
        matriculadoEm: "2026-07-20T12:00:00.000Z",
        matriculadoPor: "Bruna",
        planoId: MENSAL.id,
        status: "ativo",
        ultimaPresenca: "2026-07-30T12:00:00.000Z",
      }),
      pessoa({ id: "B", origem: "whatsapp", estagio: "interesse", criadoEm: "2026-07-10T12:00:00.000Z" }),
      pessoa({
        id: "C",
        origem: "redes",
        estagio: "perdido",
        motivoPerdido: "Achou caro",
        criadoEm: "2026-07-12T12:00:00.000Z",
      }),
      pessoa({ id: "D", origem: "indicacao", estagio: "novo", criadoEm: "2026-07-15T12:00:00.000Z" }),
      pessoa({
        id: "E",
        fase: "aluno",
        criadoEm: "2025-01-10T12:00:00.000Z",
        matriculadoEm: "2025-01-10T12:00:00.000Z",
        planoId: MENSAL.id,
        status: "ativo",
        ultimaPresenca: "2026-07-29T12:00:00.000Z",
        dataNascimento: "1990-08-12",
      }),
      pessoa({
        id: "F",
        fase: "aluno",
        criadoEm: "2026-01-01T12:00:00.000Z",
        matriculadoEm: "2026-01-01T12:00:00.000Z",
        planoId: MENSAL.id,
        status: "cancelado",
        ultimaPresenca: "2026-06-15T12:00:00.000Z",
      }),
    ],
    despesas: [
      despesa({ id: "d1", categoria: "Marketing", valor: 300 }),
      despesa({ id: "d2", categoria: "Luz", valor: 200 }),
    ],
  };
}

const indicador = (rel: Relatorio, rotulo: string): Indicador => {
  const bloco = rel.blocos.find((b) => b.tipo === "indicadores") as Extract<
    Bloco,
    { tipo: "indicadores" }
  >;
  const item = bloco.itens.find((i) => i.rotulo === rotulo);
  if (!item) throw new Error(`indicador ausente: ${rotulo}`);
  return item;
};

const tabela = (rel: Relatorio, titulo: string) => {
  const bloco = rel.blocos.find((b) => b.tipo === "tabela" && b.titulo === titulo);
  if (!bloco || bloco.tipo !== "tabela") throw new Error(`tabela ausente: ${titulo}`);
  return bloco;
};

const planilha = (rel: Relatorio, nome: string) => {
  const p = rel.planilhas.find((x) => x.nome === nome);
  if (!p) throw new Error(`planilha ausente: ${nome}`);
  return p;
};

describe("captação do período", () => {
  test("a safra é quem foi cadastrado dentro do recorte", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(indicador(rel, "Leads captados").valor).toBe("4");
    // O aluno antigo (E) e o cancelado (F) entraram antes de julho.
  });

  test("conversão da safra olha o que a própria safra virou, não o total de matrículas", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(indicador(rel, "Conversão da safra").valor).toBe("25,0%");
    expect(indicador(rel, "Matrículas no período").valor).toBe("1");
  });

  test("matrícula de lead antigo conta como matrícula do mês, mas não como conversão da safra", () => {
    const dados = base();
    const antigo = dados.pessoas.find((p) => p.id === "E")!;
    antigo.matriculadoEm = "2026-07-25T12:00:00.000Z";
    const rel = relatorioMarketing(dados, JULHO, CTX);
    expect(indicador(rel, "Matrículas no período").valor).toBe("2");
    expect(indicador(rel, "Conversão da safra").valor).toBe("25,0%");
  });
});

describe("custo de trazer aluno", () => {
  test("só despesa de captação entra no investimento", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Investimento em marketing").valor)).toBe("R$ 300,00");
    expect(indicador(rel, "Investimento em marketing").apoio).toBe("Marketing");
  });

  test("a categoria é reconhecida por palavra, não por lista fechada", () => {
    const dados = base();
    dados.despesas.push(
      despesa({ id: "d3", categoria: "Tráfego pago Instagram", valor: 100 }),
      despesa({ id: "d4", categoria: "Aluguel", valor: 900 }),
    );
    const rel = relatorioMarketing(dados, JULHO, CTX);
    expect(limpo(indicador(rel, "Investimento em marketing").valor)).toBe("R$ 400,00");
  });

  test("despesa fora do período não infla o CAC do mês", () => {
    const dados = base();
    dados.despesas.push(despesa({ id: "d5", categoria: "Marketing", valor: 999, data: "2026-06-10T12:00:00.000Z" }));
    const rel = relatorioMarketing(dados, JULHO, CTX);
    expect(limpo(indicador(rel, "CAC").valor)).toBe("R$ 300,00");
  });

  test("custo por lead e CAC dividem pelo que cada um mede", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Custo por lead").valor)).toBe("R$ 75,00");
    expect(limpo(indicador(rel, "CAC").valor)).toBe("R$ 300,00");
  });

  test("sem investimento lançado, CAC e custo por lead saem em branco em vez de zero", () => {
    // Zero diria "trazer aluno é de graça"; o traço manda lançar a despesa.
    const dados = base();
    dados.despesas = [despesa({ id: "d2", categoria: "Luz", valor: 200 })];
    const rel = relatorioMarketing(dados, JULHO, CTX);
    expect(indicador(rel, "CAC").valor).toBe("—");
    expect(indicador(rel, "Custo por lead").valor).toBe("—");
    expect(indicador(rel, "Retorno (LTV ÷ CAC)").valor).toBe("—");
  });

  test("LTV é ticket da base ativa × vida média de quem já saiu", () => {
    // Ativos A e E a R$ 120; F ficou de 01/01 a 15/06 = 5,5 meses.
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "LTV estimado").valor)).toBe("R$ 660,00");
    expect(indicador(rel, "Retorno (LTV ÷ CAC)").valor).toBe("2,2×");
  });
});

describe("por onde a gente entra", () => {
  test("a tabela de canal separa volume de eficiência", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    const linhas = tabela(rel, "Desempenho por canal").linhas;
    expect(linhas.find((l) => l[0] === "WhatsApp")?.slice(1, 4)).toEqual(["2", "1", "50%"]);
    expect(linhas.find((l) => l[0] === "Redes sociais")?.slice(1, 4)).toEqual(["1", "0", "0%"]);
    expect(linhas.find((l) => l[0] === "Balcão")?.[3]).toBe("—"); // sem lead, sem taxa
  });

  test("o motivo de perda mais frequente aparece na leitura", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(tabela(rel, "Motivos de perda").linhas[0]).toEqual(["Achou caro", "1", "100%"]);
    const leitura = rel.blocos.find((b) => b.tipo === "texto");
    expect(JSON.stringify(leitura)).toContain("Achou caro");
  });

  test("quem fechou a matrícula é creditado", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    expect(tabela(rel, "Quem fechou").linhas[0][0]).toBe("Bruna");
  });
});

describe("listas de campanha", () => {
  test("a reativação traz o cancelado com a janela certa", () => {
    const reativacao = planilha(relatorioMarketing(base(), JULHO, CTX), "reativacao");
    expect(reativacao.linhas).toHaveLength(1);
    expect(reativacao.linhas[0][0]).toBe("CDF");
    expect(reativacao.linhas[0].at(-1)).toBe("Morno"); // parado desde 15/06
  });

  test("aniversariante do mês seguinte entra na lista", () => {
    const aniversarios = planilha(relatorioMarketing(base(), JULHO, CTX), "aniversariantes");
    expect(aniversarios.linhas.map((l) => l[0])).toEqual(["CDE"]);
    expect(aniversarios.linhas[0].at(-1)).toBe("12/08");
  });

  test("aluno ativo que parou de vir entra na lista de ausentes", () => {
    const dados = base();
    dados.pessoas.find((p) => p.id === "E")!.ultimaPresenca = "2026-07-01T12:00:00.000Z";
    const ausentes = planilha(relatorioMarketing(dados, JULHO, CTX), "ausentes");
    expect(ausentes.linhas.map((l) => l[0])).toEqual(["CDE"]);
    expect(ausentes.linhas[0].at(-1)).toBe("30");
  });

  test("toda planilha tem uma coluna por célula", () => {
    const rel = relatorioMarketing(base(), JULHO, CTX);
    for (const p of rel.planilhas) {
      for (const linha of p.linhas) expect(linha).toHaveLength(p.colunas.length);
    }
  });
});

describe("base vazia", () => {
  test("academia sem lead nenhum gera relatório, não erro de divisão", () => {
    const rel = relatorioMarketing(
      { pessoas: [], planos: [], cobrancas: [], despesas: [], aulas: [] },
      JULHO,
      CTX,
    );
    expect(indicador(rel, "Leads captados").valor).toBe("0");
    expect(indicador(rel, "Conversão da safra").valor).toBe("0,0%");
    expect(tabela(rel, "Quem fechou").linhas).toHaveLength(0);
    expect(rel.planilhas.every((p) => p.linhas.length === 0)).toBe(true);
  });
});

describe("aniversário de cadastro antigo", () => {
  test("aceita o formato do formulário e o da migração", () => {
    expect(mesDiaNascimento("1990-08-12")).toBe("08-12");
    expect(mesDiaNascimento("12/08/1990")).toBe("08-12");
    expect(mesDiaNascimento("")).toBeNull();
    expect(mesDiaNascimento(undefined)).toBeNull();
  });
});
