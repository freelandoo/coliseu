import { describe, expect, test } from "vitest";
import { relatorioFinanceiro } from "@/lib/relatorios/financeiro";
import { periodoEntre } from "@/lib/relatorios/periodo";
import type { CobrancaRelatorio, DadosRelatorio } from "@/lib/relatorios/dados";
import type { Bloco, Indicador, Relatorio } from "@/lib/relatorios/tipos";
import type { Despesa, Pessoa, Plano } from "@/lib/types";

const JULHO = periodoEntre("2026-07-01", "2026-07-31");
const CTX = { geradoPor: "Alex", agora: new Date("2026-08-01T12:00:00Z") };

const MENSAL: Plano = { id: "pl-mensal", nome: "Mensal", valorMensal: 100, duracaoDias: 30 };

const limpo = (s: string) => s.replace(/[  ]/g, " ");

function aluno(over: Partial<Pessoa> & { id: string }): Pessoa {
  return {
    codigo: `CD${over.id}`,
    nome: `Aluno ${over.id}`,
    telefone: "11900000000",
    origem: "balcao",
    fase: "aluno",
    criadoEm: "2026-01-01T12:00:00.000Z",
    matriculadoEm: "2026-01-01T12:00:00.000Z",
    vencimentoPlano: "2026-08-01T12:00:00.000Z",
    ultimaPresenca: "2026-07-30T12:00:00.000Z",
    planoId: MENSAL.id,
    status: "ativo",
    ...over,
  };
}

function cobranca(over: Partial<CobrancaRelatorio> & { id: string }): CobrancaRelatorio {
  return {
    personId: "A",
    tipo: "mensalidade",
    valor: 100,
    vencimento: "2026-07-10T12:00:00.000Z",
    status: "pago",
    metodo: "pix",
    pagoEm: "2026-07-10T12:00:00.000Z",
    ...over,
  };
}

/**
 * Julho: entram R$ 100 de mensalidade no PIX e R$ 150 de matrícula em dinheiro;
 * R$ 100 de junho ficam de fora. Três alunos ativos a R$ 100, um deles
 * inadimplente com R$ 80 vencidos desde 20/06. Despesas: R$ 60 fixos e R$ 40.
 */
function base(): DadosRelatorio {
  return {
    planos: [MENSAL],
    aulas: [],
    pessoas: [
      aluno({ id: "A" }),
      aluno({ id: "B" }),
      aluno({ id: "C", status: "inadimplente" }),
      aluno({ id: "D", status: "cancelado" }),
    ],
    cobrancas: [
      cobranca({ id: "c1" }),
      cobranca({
        id: "c2",
        personId: "B",
        tipo: "matricula",
        valor: 150,
        metodo: "dinheiro",
        pagoEm: "2026-07-22T12:00:00.000Z",
      }),
      cobranca({ id: "c3", personId: "A", valor: 100, pagoEm: "2026-06-10T12:00:00.000Z" }),
      cobranca({
        id: "c4",
        personId: "C",
        valor: 80,
        status: "atrasado",
        vencimento: "2026-06-20T00:00:00.000Z",
        pagoEm: null,
        metodo: null,
      }),
    ],
    despesas: [
      { id: "d1", categoria: "Aluguel", valor: 60, data: "2026-07-05T12:00:00.000Z", recorrente: true },
      { id: "d2", categoria: "Luz", valor: 40, data: "2026-07-08T12:00:00.000Z" },
      { id: "d3", categoria: "Luz", valor: 999, data: "2026-05-08T12:00:00.000Z" },
    ] satisfies Despesa[],
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

describe("caixa do período", () => {
  test("receita é o que foi baixado dentro do recorte, pela data do pagamento", () => {
    // A cobrança paga em junho fica fora mesmo tendo vencido em julho.
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Receita recebida").valor)).toBe("R$ 250,00");
  });

  test("despesa de fora do período não entra no resultado", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Despesas do período").valor)).toBe("R$ 100,00");
    expect(limpo(indicador(rel, "Despesas do período").apoio!)).toBe(
      "R$ 60,00 fixas · R$ 40,00 variáveis",
    );
  });

  test("resultado é receita menos despesa, com a margem junto", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Resultado").valor)).toBe("R$ 150,00");
    expect(indicador(rel, "Resultado").apoio).toBe("Margem 60,0%");
    expect(indicador(rel, "Resultado").tom).toBe("ok");
  });

  test("mês no vermelho é marcado como risco", () => {
    const dados = base();
    dados.despesas.push({ id: "d4", categoria: "Reforma", valor: 500, data: "2026-07-09T12:00:00.000Z" });
    const rel = relatorioFinanceiro(dados, JULHO, CTX);
    expect(limpo(indicador(rel, "Resultado").valor)).toBe("-R$ 350,00");
    expect(indicador(rel, "Resultado").tom).toBe("risco");
  });

  test("entradas separadas por tipo e por forma de pagamento", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    const tipos = tabela(rel, "Entradas por tipo").linhas.map((l) => l.map(limpo));
    expect(tipos.find((l) => l[0] === "Mensalidade")).toEqual([
      "Mensalidade",
      "1",
      "R$ 100,00",
      "40%",
    ]);
    const formas = tabela(rel, "Entradas por forma de pagamento").linhas.map((l) => l[0]);
    expect(formas).toEqual(["Dinheiro", "PIX"]); // ordenado por valor
  });
});

describe("base e recorrência", () => {
  test("MRR conta a base ativa, cancelado fora", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Receita recorrente (MRR)").valor)).toBe("R$ 300,00");
    expect(limpo(indicador(rel, "Receita recorrente (MRR)").apoio!)).toBe(
      "3 alunos ativos · ticket R$ 100,00",
    );
  });

  test("inadimplência é sobre a base ativa e mostra o quanto está em risco", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(indicador(rel, "Inadimplência").valor).toBe("33,3%");
    expect(limpo(indicador(rel, "Inadimplência").apoio!)).toBe("1 aluno(s) · R$ 100,00/mês em risco");
    expect(indicador(rel, "Inadimplência").tom).toBe("risco");
  });

  test("ponto de equilíbrio diz quantos alunos pagam a conta e quanta folga sobra", () => {
    // R$ 100 de despesa ÷ R$ 100 de ticket = 1 aluno; a base tem 3.
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(indicador(rel, "Ponto de equilíbrio").valor).toBe("1 alunos");
    expect(indicador(rel, "Ponto de equilíbrio").apoio).toContain("folga de 2");
  });

  test("quando a despesa passa da base, o indicador diz quantas matrículas faltam", () => {
    const dados = base();
    dados.despesas.push({ id: "d4", categoria: "Reforma", valor: 500, data: "2026-07-09T12:00:00.000Z" });
    const rel = relatorioFinanceiro(dados, JULHO, CTX);
    expect(indicador(rel, "Ponto de equilíbrio").valor).toBe("6 alunos");
    expect(indicador(rel, "Ponto de equilíbrio").apoio).toContain("faltam 3");
    expect(indicador(rel, "Ponto de equilíbrio").tom).toBe("risco");
  });
});

describe("cobranças em aberto", () => {
  test("o atraso é contado até o fim do período, não até hoje", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    expect(limpo(indicador(rel, "Atrasado em aberto").valor)).toBe("R$ 80,00");
    const aging = rel.blocos.find((b) => b.tipo === "barras" && b.titulo.startsWith("Inadimplência"));
    expect(aging?.tipo === "barras" && aging.itens.find((i) => i.rotulo === "31 a 60 dias")?.valor).toBe(80);
  });

  test("o maior devedor sai com nome, quantidade e dias", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    const [linha] = tabela(rel, "Maiores devedores").linhas;
    expect(linha[0]).toBe("Aluno C");
    expect(linha[2]).toBe("1");
    expect(linha[3]).toBe("41d");
  });

  test("cobrança ainda no prazo não vira atraso", () => {
    const dados = base();
    dados.cobrancas.push(
      cobranca({ id: "c5", status: "pendente", pagoEm: null, vencimento: "2026-07-31T00:00:00.000Z" }),
    );
    const rel = relatorioFinanceiro(dados, JULHO, CTX);
    expect(limpo(indicador(rel, "A vencer").valor)).toBe("R$ 100,00");
    expect(limpo(indicador(rel, "Atrasado em aberto").valor)).toBe("R$ 80,00");
  });
});

describe("planilhas", () => {
  test("recebimentos trazem só o período, em ordem de pagamento", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    const recebimentos = rel.planilhas.find((p) => p.nome === "recebimentos")!;
    expect(recebimentos.linhas.map((l) => l[0])).toEqual(["10/07/2026", "22/07/2026"]);
  });

  test("valor sai como número para a planilha somar, sem R$", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    const recebimentos = rel.planilhas.find((p) => p.nome === "recebimentos")!;
    expect(recebimentos.linhas[0].at(-1)).toBe("100,00");
  });

  test("toda planilha tem uma coluna por célula", () => {
    const rel = relatorioFinanceiro(base(), JULHO, CTX);
    for (const p of rel.planilhas) {
      for (const linha of p.linhas) expect(linha).toHaveLength(p.colunas.length);
    }
  });
});

test("academia sem movimento nenhum gera relatório, não divisão por zero", () => {
  const rel = relatorioFinanceiro(
    { pessoas: [], planos: [], cobrancas: [], despesas: [], aulas: [] },
    JULHO,
    CTX,
  );
  expect(limpo(indicador(rel, "Receita recebida").valor)).toBe("R$ 0,00");
  expect(indicador(rel, "Inadimplência").valor).toBe("0,0%");
  expect(indicador(rel, "Ponto de equilíbrio").valor).toBe("—");
  expect(indicador(rel, "Recebido ÷ MRR").valor).toBe("—");
});
