/**
 * Relatório financeiro — o fechamento do período em regime de caixa.
 *
 * "Receita" aqui é dinheiro que entrou (cobrança baixada dentro do recorte), e
 * não mensalidade contratada. Os dois números convivem no relatório de
 * propósito: o MRR diz quanto a base *deveria* pagar por mês e a receita
 * recebida diz quanto de fato pagou — a diferença entre eles é a inadimplência,
 * e é essa distância que o dono precisa enxergar sem fazer conta.
 *
 * Função pura sobre `DadosRelatorio` — ver `dados.ts`.
 */

import { COBRANCA_STATUS_LABEL, type CobrancaTipo, type Pessoa } from "@/lib/types";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import { baseAtiva, nomeDoPlano, valorDoPlano, type DadosRelatorio } from "./dados";
import { dentro, diasAte, type Periodo } from "./periodo";
import {
  dataCurta,
  dataHora,
  inteiro,
  moeda,
  numero,
  pct,
  percentual,
  razao,
  type Bloco,
  type Indicador,
  type LinhaBarra,
  type Planilha,
  type Relatorio,
  type Tom,
} from "./tipos";
import type { ContextoRelatorio } from "./marketing";

const TIPO_LABEL: Record<CobrancaTipo, string> = {
  matricula: "Matrícula",
  mensalidade: "Mensalidade",
  renovacao: "Renovação",
};

const METODO_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
};

/**
 * Faixas de atraso. O corte em 30 e 60 dias não é decorativo: até 30 dias a
 * cobrança ainda responde a mensagem, depois de 60 a conversa já é outra
 * (renegociar ou dar baixa), e misturar as duas numa linha só de "atrasado"
 * esconde qual das duas o balcão tem pela frente.
 */
const FAIXAS_ATRASO = [
  { rotulo: "1 a 15 dias", min: 1, max: 15 },
  { rotulo: "16 a 30 dias", min: 16, max: 30 },
  { rotulo: "31 a 60 dias", min: 31, max: 60 },
  { rotulo: "mais de 60 dias", min: 61, max: Infinity },
] as const;

const telefone = (p: Pessoa | undefined) =>
  p?.telefone ? formatarTelefone(p.telefone) : "—";

function somar<T>(itens: T[], campo: (t: T) => number): number {
  return itens.reduce((s, t) => s + campo(t), 0);
}

export function relatorioFinanceiro(
  dados: DadosRelatorio,
  periodo: Periodo,
  ctx: ContextoRelatorio,
): Relatorio {
  const { pessoas, planos, cobrancas, despesas } = dados;
  const valorMensal = valorDoPlano(planos);
  const planoDe = nomeDoPlano(planos);
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));

  /* ---------- entradas ---------- */
  const recebidas = cobrancas.filter((c) => c.status === "pago" && dentro(periodo, c.pagoEm));
  const receitaRecebida = somar(recebidas, (c) => c.valor);

  const porTipo = (["mensalidade", "matricula", "renovacao"] as CobrancaTipo[]).map((tipo) => {
    const doTipo = recebidas.filter((c) => c.tipo === tipo);
    return { tipo, qtd: doTipo.length, valor: somar(doTipo, (c) => c.valor) };
  });

  const metodos = new Map<string, { qtd: number; valor: number }>();
  for (const c of recebidas) {
    const chave = c.metodo ? (METODO_LABEL[c.metodo] ?? c.metodo) : "Não informado";
    const atual = metodos.get(chave) ?? { qtd: 0, valor: 0 };
    atual.qtd += 1;
    atual.valor += c.valor;
    metodos.set(chave, atual);
  }
  const porMetodo = [...metodos.entries()]
    .map(([rotulo, v]) => ({ rotulo, ...v }))
    .sort((a, b) => b.valor - a.valor);

  /* ---------- saídas ---------- */
  const despesasPeriodo = despesas.filter((d) => dentro(periodo, d.data));
  const totalDespesas = somar(despesasPeriodo, (d) => d.valor);
  const fixas = somar(despesasPeriodo.filter((d) => d.recorrente), (d) => d.valor);
  const variaveis = totalDespesas - fixas;

  const categorias = new Map<string, number>();
  for (const d of despesasPeriodo) {
    categorias.set(d.categoria, (categorias.get(d.categoria) ?? 0) + d.valor);
  }
  const porCategoria = [...categorias.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);

  /* ---------- resultado ---------- */
  const lucro = receitaRecebida - totalDespesas;
  const margem = percentual(lucro, receitaRecebida);

  /* ---------- base e recorrência ---------- */
  const ativos = baseAtiva(pessoas);
  const mrr = somar(ativos, (p) => valorMensal(p.planoId));
  const ticketMedio = razao(mrr, ativos.length);
  const inadimplentes = ativos.filter((p) => p.status === "inadimplente");
  const taxaInadimplencia = percentual(inadimplentes.length, ativos.length);
  const mrrEmRisco = somar(inadimplentes, (p) => valorMensal(p.planoId));

  // Quantos alunos pagantes a conta do mês exige. É o número que responde
  // "posso contratar mais um professor?" sem abrir planilha.
  const pontoEquilibrio = ticketMedio > 0 ? Math.ceil(totalDespesas / ticketMedio) : 0;
  const folga = ativos.length - pontoEquilibrio;

  /* ---------- em aberto ---------- */
  // Quais cobranças estão abertas é a situação de agora (é o que o balcão vai
  // cobrar); o tamanho do atraso é contado até o fim do período, senão um
  // relatório de março reimpresso em agosto envelheceria sozinho.
  const emAberto = cobrancas.filter((c) => c.status !== "pago");
  const atrasadas = emAberto
    .map((c) => ({ cobranca: c, dias: diasAte(periodo, c.vencimento) }))
    .filter((x) => x.dias > 0)
    .sort((a, b) => b.dias - a.dias);
  const aVencer = emAberto.filter((c) => diasAte(periodo, c.vencimento) <= 0);
  const totalAtrasado = somar(atrasadas, (x) => x.cobranca.valor);
  const totalAVencer = somar(aVencer, (c) => c.valor);

  const aging: LinhaBarra[] = FAIXAS_ATRASO.map((f) => {
    const naFaixa = atrasadas.filter((x) => x.dias >= f.min && x.dias <= f.max);
    const total = somar(naFaixa, (x) => x.cobranca.valor);
    return {
      rotulo: f.rotulo,
      valor: total,
      exibicao: `${moeda(total)} · ${naFaixa.length} cobrança${naFaixa.length === 1 ? "" : "s"}`,
      tom: (f.min <= 15 ? "alerta" : "risco") as Tom,
    };
  });

  /* ---------- receita por plano ---------- */
  const porPlano = planos
    .map((p) => {
      const doPlano = ativos.filter((a) => a.planoId === p.id);
      return {
        nome: p.nome,
        alunos: doPlano.length,
        receita: doPlano.length * p.valorMensal,
        valorMensal: p.valorMensal,
      };
    })
    .filter((p) => p.alunos > 0)
    .sort((a, b) => b.receita - a.receita);

  /* ---------- devedores ---------- */
  const dividaPorPessoa = new Map<string, { valor: number; qtd: number; diasMax: number }>();
  for (const { cobranca, dias } of atrasadas) {
    const atual = dividaPorPessoa.get(cobranca.personId) ?? { valor: 0, qtd: 0, diasMax: 0 };
    atual.valor += cobranca.valor;
    atual.qtd += 1;
    atual.diasMax = Math.max(atual.diasMax, dias);
    dividaPorPessoa.set(cobranca.personId, atual);
  }
  const devedores = [...dividaPorPessoa.entries()]
    .map(([personId, v]) => ({ pessoa: pessoaPorId.get(personId), ...v }))
    .sort((a, b) => b.valor - a.valor);

  /* ---------- indicadores ---------- */
  const indicadores: Indicador[] = [
    {
      rotulo: "Receita recebida",
      valor: moeda(receitaRecebida),
      apoio: `${recebidas.length} cobrança${recebidas.length === 1 ? "" : "s"} baixada${recebidas.length === 1 ? "" : "s"} no período`,
      tom: "ok",
    },
    {
      rotulo: "Despesas do período",
      valor: moeda(totalDespesas),
      apoio: `${moeda(fixas)} fixas · ${moeda(variaveis)} variáveis`,
      tom: "risco",
    },
    {
      rotulo: "Resultado",
      valor: moeda(lucro),
      apoio: `Margem ${pct(margem)}`,
      tom: lucro >= 0 ? "ok" : "risco",
    },
    {
      rotulo: "Receita recorrente (MRR)",
      valor: moeda(mrr),
      apoio: `${inteiro(ativos.length)} alunos ativos · ticket ${moeda(ticketMedio)}`,
    },
    {
      rotulo: "Inadimplência",
      valor: pct(taxaInadimplencia),
      apoio: `${inadimplentes.length} aluno(s) · ${moeda(mrrEmRisco)}/mês em risco`,
      tom: taxaInadimplencia >= 10 ? "risco" : taxaInadimplencia >= 5 ? "alerta" : "ok",
    },
    {
      rotulo: "Atrasado em aberto",
      valor: moeda(totalAtrasado),
      apoio: `${atrasadas.length} cobrança(s) vencida(s)`,
      tom: totalAtrasado > 0 ? "risco" : "ok",
    },
    {
      rotulo: "A vencer",
      valor: moeda(totalAVencer),
      apoio: `${aVencer.length} cobrança(s) ainda no prazo`,
    },
    {
      rotulo: "Ponto de equilíbrio",
      valor: pontoEquilibrio > 0 ? `${inteiro(pontoEquilibrio)} alunos` : "—",
      // O apoio cabe em ~45 caracteres no cartão do PDF; o "folga/faltam" é a
      // parte que não pode ser cortada, então vem primeiro.
      apoio:
        pontoEquilibrio > 0
          ? `${folga >= 0 ? `folga de ${folga}` : `faltam ${-folga}`} · ticket ${moeda(ticketMedio)}`
          : "sem despesa ou sem ticket para calcular",
      tom: pontoEquilibrio > 0 ? (folga >= 0 ? "ok" : "risco") : "neutro",
    },
    {
      rotulo: "Recebido ÷ MRR",
      valor: mrr > 0 ? pct(percentual(receitaRecebida, mrr), 0) : "—",
      apoio: "quanto do contratado virou caixa no período",
      tom: "neutro",
    },
  ];

  /* ---------- leitura ---------- */
  const leitura: string[] = [];
  leitura.push(
    lucro >= 0
      ? `O período fechou positivo em ${moeda(lucro)} (margem ${pct(margem)}): entraram ${moeda(receitaRecebida)} e saíram ${moeda(totalDespesas)}.`
      : `O período fechou negativo em ${moeda(Math.abs(lucro))}: entraram ${moeda(receitaRecebida)} e saíram ${moeda(totalDespesas)}.`,
  );
  if (pontoEquilibrio > 0) {
    leitura.push(
      folga >= 0
        ? `A conta do período se paga com ${pontoEquilibrio} alunos no ticket de ${moeda(ticketMedio)}; a base tem ${ativos.length} — folga de ${folga}.`
        : `A conta do período exige ${pontoEquilibrio} alunos no ticket de ${moeda(ticketMedio)} e a base tem ${ativos.length}: faltam ${-folga} matrículas (ou ${moeda(-folga * ticketMedio)}/mês) para o zero a zero.`,
    );
  }
  if (totalAtrasado > 0) {
    const maisDe30 = atrasadas.filter((x) => x.dias > 30);
    leitura.push(
      `Há ${moeda(totalAtrasado)} vencidos em ${atrasadas.length} cobrança(s)${
        maisDe30.length ? `, sendo ${moeda(somar(maisDe30, (x) => x.cobranca.valor))} com mais de 30 dias` : ""
      }. É o caixa mais barato de recuperar: já foi vendido.`,
    );
  }
  if (porCategoria.length) {
    const maior = porCategoria[0];
    leitura.push(
      `Maior despesa: ${maior.categoria} (${moeda(maior.valor)}, ${pct(percentual(maior.valor, totalDespesas), 0)} do total).`,
    );
  }
  if (fixas > 0) {
    leitura.push(
      `Custo fixo de ${moeda(fixas)} — é o piso que a academia paga mesmo em mês parado, e o que define quanto a base não pode encolher.`,
    );
  }

  /* ---------- blocos ---------- */
  const blocos: Bloco[] = [
    { tipo: "indicadores", titulo: "Fechamento do período", itens: indicadores },
    {
      tipo: "barras",
      titulo: "Resultado",
      itens: [
        { rotulo: "Receita", valor: receitaRecebida, exibicao: moeda(receitaRecebida), tom: "ok" },
        { rotulo: "Despesas", valor: totalDespesas, exibicao: moeda(totalDespesas), tom: "risco" },
        {
          rotulo: "Lucro",
          valor: Math.max(lucro, 0),
          exibicao: moeda(lucro),
          tom: lucro >= 0 ? "ok" : "risco",
        },
      ],
    },
    {
      tipo: "tabela",
      titulo: "Entradas por tipo",
      colunas: [
        { rotulo: "Tipo", peso: 2 },
        { rotulo: "Cobranças", alinhamento: "direita" },
        { rotulo: "Valor", alinhamento: "direita" },
        { rotulo: "Peso", alinhamento: "direita" },
      ],
      linhas: porTipo.map((t) => [
        TIPO_LABEL[t.tipo],
        inteiro(t.qtd),
        moeda(t.valor),
        pct(percentual(t.valor, receitaRecebida), 0),
      ]),
      vazio: "Nenhuma cobrança baixada no período.",
    },
    {
      tipo: "tabela",
      titulo: "Entradas por forma de pagamento",
      nota: "Cobrança do Asaas sem forma registrada aparece como não informada.",
      colunas: [
        { rotulo: "Forma", peso: 2 },
        { rotulo: "Cobranças", alinhamento: "direita" },
        { rotulo: "Valor", alinhamento: "direita" },
        { rotulo: "Peso", alinhamento: "direita" },
      ],
      linhas: porMetodo.map((m) => [
        m.rotulo,
        inteiro(m.qtd),
        moeda(m.valor),
        pct(percentual(m.valor, receitaRecebida), 0),
      ]),
      vazio: "Nenhuma cobrança baixada no período.",
    },
    {
      tipo: "tabela",
      titulo: "Despesas por categoria",
      colunas: [
        { rotulo: "Categoria", peso: 2 },
        { rotulo: "Valor", alinhamento: "direita" },
        { rotulo: "Peso", alinhamento: "direita" },
      ],
      linhas: porCategoria.map((c) => [
        c.categoria,
        moeda(c.valor),
        pct(percentual(c.valor, totalDespesas), 0),
      ]),
      vazio: "Nenhuma despesa lançada no período.",
    },
    {
      tipo: "barras",
      titulo: "Inadimplência por tempo de atraso",
      nota: "Cobranças ainda em aberto, com o atraso contado até o fim do período.",
      itens: aging,
    },
    {
      tipo: "tabela",
      titulo: "Receita recorrente por plano",
      colunas: [
        { rotulo: "Plano", peso: 2 },
        { rotulo: "Alunos", alinhamento: "direita" },
        { rotulo: "Mensalidade", alinhamento: "direita" },
        { rotulo: "Receita/mês", alinhamento: "direita" },
      ],
      linhas: porPlano.map((p) => [
        p.nome,
        inteiro(p.alunos),
        moeda(p.valorMensal),
        moeda(p.receita),
      ]),
      vazio: "Nenhum aluno ativo.",
    },
    {
      tipo: "tabela",
      titulo: "Maiores devedores",
      nota: "Ordenado por valor vencido. A lista completa sai na exportação em planilha.",
      colunas: [
        { rotulo: "Aluno", peso: 2.2 },
        { rotulo: "Telefone", peso: 1.4 },
        { rotulo: "Cobranças", alinhamento: "direita" },
        { rotulo: "Atraso", alinhamento: "direita" },
        { rotulo: "Valor", alinhamento: "direita" },
      ],
      linhas: devedores.slice(0, 12).map((d) => [
        d.pessoa?.nome ?? "—",
        telefone(d.pessoa),
        inteiro(d.qtd),
        `${inteiro(d.diasMax)}d`,
        moeda(d.valor),
      ]),
      vazio: "Nenhuma cobrança vencida.",
    },
    { tipo: "texto", titulo: "Leitura do período", paragrafos: leitura },
  ];

  /* ---------- planilhas ---------- */
  const planilhas: Planilha[] = [
    {
      nome: "recebimentos",
      titulo: "Recebimentos do período",
      colunas: ["Data", "Aluno", "Código", "Tipo", "Forma", "Vencimento", "Valor"],
      linhas: recebidas
        .slice()
        .sort((a, b) => (a.pagoEm ?? "").localeCompare(b.pagoEm ?? ""))
        .map((c) => {
          const p = pessoaPorId.get(c.personId);
          return [
            dataCurta(c.pagoEm),
            p?.nome ?? "—",
            p?.codigo ?? "",
            TIPO_LABEL[c.tipo],
            c.metodo ? (METODO_LABEL[c.metodo] ?? c.metodo) : "Não informado",
            dataCurta(c.vencimento),
            numero(c.valor, 2),
          ];
        }),
    },
    {
      nome: "a-receber",
      titulo: "Cobranças em aberto",
      colunas: ["Aluno", "Código", "Telefone", "Tipo", "Vencimento", "Situação", "Dias de atraso", "Valor"],
      linhas: emAberto
        .map((c) => ({ c, dias: diasAte(periodo, c.vencimento) }))
        .sort((a, b) => b.dias - a.dias)
        .map(({ c, dias }) => {
          const p = pessoaPorId.get(c.personId);
          return [
            p?.nome ?? "—",
            p?.codigo ?? "",
            telefone(p),
            TIPO_LABEL[c.tipo],
            dataCurta(c.vencimento),
            COBRANCA_STATUS_LABEL[c.status],
            dias > 0 ? inteiro(dias) : "0",
            numero(c.valor, 2),
          ];
        }),
    },
    {
      nome: "despesas",
      titulo: "Despesas do período",
      colunas: ["Data", "Categoria", "Descrição", "Fixa", "Valor"],
      linhas: despesasPeriodo
        .slice()
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((d) => [
          dataCurta(d.data),
          d.categoria,
          d.descricao ?? "",
          d.recorrente ? "sim" : "não",
          numero(d.valor, 2),
        ]),
    },
    {
      nome: "inadimplentes",
      titulo: "Alunos inadimplentes",
      colunas: ["Código", "Nome", "Telefone", "Plano", "Mensalidade", "Vencimento do plano", "Vencido em aberto"],
      linhas: inadimplentes.map((p) => [
        p.codigo,
        p.nome,
        telefone(p),
        planoDe(p.planoId),
        numero(valorMensal(p.planoId), 2),
        dataCurta(p.vencimentoPlano),
        numero(dividaPorPessoa.get(p.id)?.valor ?? 0, 2),
      ]),
    },
  ];

  const observacoes = [
    "Regime de caixa: receita é cobrança baixada dentro do período, não mensalidade contratada.",
    "MRR, inadimplência e cobranças em aberto são a situação de agora; só o tempo de atraso é contado até o fim do período.",
    "Despesas entram pela data do lançamento em Custos.",
  ];

  return {
    tipo: "financeiro",
    titulo: "Relatório Financeiro",
    periodo: periodo.rotulo,
    geradoEm: dataHora(ctx.agora ?? new Date()),
    geradoPor: ctx.geradoPor,
    observacoes,
    blocos,
    planilhas,
  };
}
