/**
 * Relatório de marketing — o que a academia gastou para trazer gente, quem
 * veio, por qual porta, quanto essa gente vale e quem já está aqui dentro
 * esperando uma campanha.
 *
 * A pergunta que ele responde não é "quantos leads entraram" (isso o painel já
 * mostra), é **onde colocar o próximo real**: o canal com melhor conversão, o
 * CAC contra o LTV, o motivo de perda que se repete e as três listas de público
 * pronto (reativação, aniversário, ausente) que viram disparo no dia seguinte.
 *
 * Função pura sobre `DadosRelatorio` — ver `dados.ts`.
 */

import {
  ORIGEM_LABEL,
  type Origem,
  type Pessoa,
} from "@/lib/types";
import { FAIXAS_TEMPO, faixaFidelidade, FAIXA_LABEL } from "@/lib/fidelidade";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import { baseAtiva, cancelados, nomeDoPlano, valorDoPlano, type DadosRelatorio } from "./dados";
import { dentro, diasAte, mesesAte, type Periodo } from "./periodo";
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

/**
 * Categorias de despesa que contam como investimento em captação.
 *
 * É por palavra na categoria (que é texto livre no lançamento) e não por uma
 * lista fechada: o balcão lança "Marketing", "Tráfego pago", "Impulsionamento
 * Instagram" conforme o dia. Errar para menos aqui infla o ROI — por isso o
 * relatório sempre imprime quanto encontrou e em quais categorias, para o dono
 * conferir se faltou alguma.
 */
const PALAVRAS_MARKETING =
  /marketing|tr[áa]fego|an[úu]ncio|publicidade|m[íi]dia|panfleto|impulsion|divulga|google|meta|instagram|facebook|assessoria|influenc|patroc/i;

const ORDEM_ORIGEM: Origem[] = ["whatsapp", "redes", "indicacao", "balcao"];

const DIA_MS = 86_400_000;

/** Meses corridos entre duas datas ISO. Fora de ordem devolve zero. */
function mesesEntre(inicio: string | undefined, fim: string | undefined): number {
  if (!inicio || !fim) return 0;
  const a = Date.parse(inicio);
  const b = Date.parse(fim);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return (b - a) / (30 * DIA_MS);
}

/** Dias corridos entre duas datas ISO. */
function diasEntreIso(inicio: string | undefined, fim: string | undefined): number {
  if (!inicio || !fim) return 0;
  const a = Date.parse(inicio);
  const b = Date.parse(fim);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return (b - a) / DIA_MS;
}

function media(valores: number[]): number {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : 0;
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}

/**
 * "MM-DD" do aniversário. Aceita o "AAAA-MM-DD" do formulário e o "DD/MM/AAAA"
 * que veio da migração — cadastro antigo não pode ficar de fora da campanha só
 * por ter nascido noutro sistema.
 */
export function mesDiaNascimento(valor: string | undefined): string | null {
  if (!valor) return null;
  const iso = valor.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}-${iso[3]}`;
  const br = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[2]}-${br[1]}`;
  return null;
}

const telefone = (p: Pessoa) => (p.telefone ? formatarTelefone(p.telefone) : "—");

export interface ContextoRelatorio {
  geradoPor: string;
  agora?: Date;
}

export function relatorioMarketing(
  dados: DadosRelatorio,
  periodo: Periodo,
  ctx: ContextoRelatorio,
): Relatorio {
  const { pessoas, planos, despesas, aulas } = dados;
  const valorMensal = valorDoPlano(planos);
  const planoDe = nomeDoPlano(planos);

  /* ---------- safra do período ---------- */
  // "Safra" = quem entrou no cadastro dentro do recorte. É a única coorte que
  // dá para acompanhar de ponta a ponta: comparar matrícula do mês com lead do
  // mês mistura gente que chegou em março com dinheiro gasto em agosto.
  const safra = pessoas.filter((p) => dentro(periodo, p.criadoEm));
  const safraConvertida = safra.filter((p) => p.fase === "aluno");
  const matriculas = pessoas.filter((p) => p.fase === "aluno" && dentro(periodo, p.matriculadoEm));

  /* ---------- investimento ---------- */
  const despesasPeriodo = despesas.filter((d) => dentro(periodo, d.data));
  const despesasMarketing = despesasPeriodo.filter((d) => PALAVRAS_MARKETING.test(d.categoria));
  const investimento = despesasMarketing.reduce((s, d) => s + d.valor, 0);
  const categoriasEncontradas = [...new Set(despesasMarketing.map((d) => d.categoria))].sort();

  const custoPorLead = razao(investimento, safra.length);
  const cac = razao(investimento, matriculas.length);

  /* ---------- valor do aluno ---------- */
  const ativos = baseAtiva(pessoas);
  const saidas = cancelados(pessoas);
  const ticketMedio = razao(
    ativos.reduce((s, p) => s + valorMensal(p.planoId), 0),
    ativos.length,
  );
  // Vida média sai dos ciclos já fechados (matrícula → última presença). Sem
  // cancelamento nenhum, o melhor palpite é o tempo de casa de quem está aqui —
  // que subestima, porque essa gente ainda não terminou de ficar.
  const vidaMedia = saidas.length
    ? media(saidas.map((p) => mesesEntre(p.matriculadoEm, p.ultimaPresenca)))
    : media(ativos.map((p) => mesesAte(periodo, p.matriculadoEm)));
  const ltv = ticketMedio * vidaMedia;
  const retorno = razao(ltv, cac);

  /* ---------- aula experimental ---------- */
  const aulasPeriodo = aulas.filter((a) => dentro(periodo, a.criadoEm));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const aulasQueViraramAluno = aulasPeriodo.filter((a) => {
    if (!a.personId) return false;
    const p = pessoaPorId.get(a.personId);
    return !!p && p.fase === "aluno" && diasEntreIso(a.criadoEm, p.matriculadoEm) >= 0;
  }).length;
  const aproveitamentoAula = percentual(aulasQueViraramAluno, aulasPeriodo.length);

  /* ---------- funil ---------- */
  const contarEstagio = (estagio: string) =>
    safra.filter((p) => (p.estagio ?? "novo") === estagio).length;
  const funil: LinhaBarra[] = [
    { rotulo: "Lead novo", valor: contarEstagio("novo"), exibicao: inteiro(contarEstagio("novo")), tom: "neutro" },
    { rotulo: "Qualificado", valor: contarEstagio("qualificado"), exibicao: inteiro(contarEstagio("qualificado")), tom: "neutro" },
    { rotulo: "Com interesse", valor: contarEstagio("interesse"), exibicao: inteiro(contarEstagio("interesse")), tom: "alerta" },
    { rotulo: "Convertido", valor: safraConvertida.length, exibicao: inteiro(safraConvertida.length), tom: "ok" },
    { rotulo: "Perdido", valor: contarEstagio("perdido"), exibicao: inteiro(contarEstagio("perdido")), tom: "risco" },
  ];
  const conversaoSafra = percentual(safraConvertida.length, safra.length);

  /* ---------- canal ---------- */
  const porCanal = ORDEM_ORIGEM.map((origem) => {
    const leads = safra.filter((p) => p.origem === origem);
    const convertidos = leads.filter((p) => p.fase === "aluno");
    const matriculadosNoPeriodo = matriculas.filter((p) => p.origem === origem);
    return {
      origem,
      leads: leads.length,
      convertidos: convertidos.length,
      conversao: percentual(convertidos.length, leads.length),
      receita: matriculadosNoPeriodo.reduce((s, p) => s + valorMensal(p.planoId), 0),
      matriculas: matriculadosNoPeriodo.length,
    };
  });
  const canalCampeao = [...porCanal]
    .filter((c) => c.leads >= 3)
    .sort((a, b) => b.conversao - a.conversao)[0];
  const canalMaisVolume = [...porCanal].sort((a, b) => b.leads - a.leads)[0];

  /* ---------- tempo até fechar ---------- */
  const temposDeFechamento = matriculas
    .map((p) => diasEntreIso(p.criadoEm, p.matriculadoEm))
    .filter((d) => d > 0);
  const tempoMedioFechar = media(temposDeFechamento);
  const tempoMedianoFechar = mediana(temposDeFechamento);

  /* ---------- consultores ---------- */
  const porConsultor = new Map<string, { matriculas: number; receita: number }>();
  for (const p of matriculas) {
    const nome = p.matriculadoPor?.trim() || p.vendedor?.trim() || "Não registrado";
    const atual = porConsultor.get(nome) ?? { matriculas: 0, receita: 0 };
    atual.matriculas += 1;
    atual.receita += valorMensal(p.planoId);
    porConsultor.set(nome, atual);
  }
  const consultores = [...porConsultor.entries()]
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.matriculas - a.matriculas || b.receita - a.receita);

  /* ---------- retenção (o marketing precisa saber se o aluno fica) ---------- */
  const alunos = pessoas.filter((p) => p.fase === "aluno");
  const coorte: LinhaBarra[] = FAIXAS_TEMPO.map((f) => {
    const naFaixa = alunos.filter((p) => {
      const m = mesesAte(periodo, p.matriculadoEm);
      return m >= f.min && m < f.max;
    });
    const aindaAtivos = naFaixa.filter((p) => p.status !== "cancelado").length;
    const p = percentual(aindaAtivos, naFaixa.length);
    return {
      rotulo: f.label,
      valor: Math.round(p),
      exibicao: naFaixa.length ? `${pct(p, 0)} de ${naFaixa.length}` : "sem base",
      tom: (p >= 70 ? "ok" : p >= 40 ? "alerta" : "risco") as Tom,
    };
  });

  const mix: LinhaBarra[] = (["novato", "firmando", "fiel", "veterano"] as const).map((faixa) => {
    const qtd = ativos.filter(
      (p) => faixaFidelidade(mesesAte(periodo, p.matriculadoEm)) === faixa,
    ).length;
    return {
      rotulo: FAIXA_LABEL[faixa],
      valor: qtd,
      exibicao: `${inteiro(qtd)} (${pct(percentual(qtd, ativos.length), 0)})`,
      tom: "neutro",
    };
  });

  /* ---------- motivos de perda ---------- */
  const perdidos = safra.filter((p) => p.estagio === "perdido");
  const motivos = new Map<string, number>();
  for (const p of perdidos) {
    const m = p.motivoPerdido?.trim() || "Sem motivo registrado";
    motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }
  const motivosOrdenados = [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  /* ---------- públicos de campanha ---------- */
  const reativacao = saidas
    .map((p) => ({ pessoa: p, meses: mesesAte(periodo, p.ultimaPresenca) }))
    .sort((a, b) => a.meses - b.meses);
  const recentes = reativacao.filter((r) => r.meses < 2);
  const mornos = reativacao.filter((r) => r.meses >= 2 && r.meses < 6);
  const frios = reativacao.filter((r) => r.meses >= 6);

  const ausentes = ativos
    .map((p) => ({ pessoa: p, dias: Math.max(0, diasAte(periodo, p.ultimaPresenca)) }))
    .filter((a) => a.dias >= 7)
    .sort((a, b) => b.dias - a.dias);

  // Aniversário é campanha do mês que vem: a lista sai hoje para a arte e o
  // disparo serem preparados antes do dia.
  const proximoMes = String(((Number(periodo.ate.slice(5, 7)) % 12) + 1)).padStart(2, "0");
  const aniversariantes = pessoas
    .filter((p) => mesDiaNascimento(p.dataNascimento)?.startsWith(proximoMes))
    .sort((a, b) =>
      (mesDiaNascimento(a.dataNascimento) ?? "").localeCompare(mesDiaNascimento(b.dataNascimento) ?? ""),
    );

  /* ---------- indicadores ---------- */
  const indicadores: Indicador[] = [
    {
      rotulo: "Leads captados",
      valor: inteiro(safra.length),
      apoio: `${numero(razao(safra.length, periodo.dias), 1)} por dia · ${periodo.dias} dias`,
    },
    {
      rotulo: "Matrículas no período",
      valor: inteiro(matriculas.length),
      apoio: `${moeda(matriculas.reduce((s, p) => s + valorMensal(p.planoId), 0))} de receita/mês`,
      tom: "ok",
    },
    {
      rotulo: "Conversão da safra",
      valor: pct(conversaoSafra),
      apoio: `${safraConvertida.length} de ${safra.length} leads captados`,
      tom: conversaoSafra >= 20 ? "ok" : conversaoSafra >= 10 ? "alerta" : "risco",
    },
    {
      rotulo: "Investimento em marketing",
      valor: moeda(investimento),
      apoio: categoriasEncontradas.length
        ? categoriasEncontradas.join(", ")
        : "nenhuma despesa de marketing lançada",
      tom: investimento > 0 ? "neutro" : "alerta",
    },
    {
      rotulo: "Custo por lead",
      valor: investimento > 0 ? moeda(custoPorLead) : "—",
      apoio: investimento > 0 ? `${inteiro(safra.length)} leads no período` : "sem investimento lançado",
    },
    {
      rotulo: "CAC",
      valor: investimento > 0 && matriculas.length > 0 ? moeda(cac) : "—",
      apoio:
        investimento > 0 && matriculas.length > 0
          ? `custo de trazer 1 aluno (${matriculas.length} no período)`
          : "precisa de investimento e matrícula no período",
      tom: cac > 0 && ltv > 0 && cac > ltv ? "risco" : "neutro",
    },
    {
      rotulo: "LTV estimado",
      valor: moeda(ltv),
      apoio: `${moeda(ticketMedio)} × ${numero(vidaMedia, 1)} meses de vida média`,
    },
    {
      rotulo: "Retorno (LTV ÷ CAC)",
      valor: cac > 0 ? `${numero(retorno, 1)}×` : "—",
      apoio: cac > 0 ? "saudável a partir de 3×" : "sem CAC calculável",
      tom: cac > 0 ? (retorno >= 3 ? "ok" : retorno >= 1 ? "alerta" : "risco") : "neutro",
    },
    {
      rotulo: "Aula experimental",
      valor: aulasPeriodo.length ? pct(aproveitamentoAula, 0) : "—",
      apoio: aulasPeriodo.length
        ? `${aulasQueViraramAluno} de ${aulasPeriodo.length} agendadas viraram matrícula`
        : "nenhuma aula agendada no período",
      tom: aproveitamentoAula >= 40 ? "ok" : aulasPeriodo.length ? "alerta" : "neutro",
    },
  ];

  /* ---------- leitura ---------- */
  const leitura: string[] = [];
  if (canalMaisVolume && canalMaisVolume.leads > 0) {
    leitura.push(
      `Volume: ${ORIGEM_LABEL[canalMaisVolume.origem]} trouxe ${canalMaisVolume.leads} dos ${safra.length} leads do período.`,
    );
  }
  if (canalCampeao && canalCampeao.conversao > 0) {
    leitura.push(
      `Eficiência: ${ORIGEM_LABEL[canalCampeao.origem]} converte ${pct(canalCampeao.conversao, 0)} — é onde o próximo real rende mais.`,
    );
  }
  if (cac > 0 && ltv > 0) {
    leitura.push(
      retorno >= 3
        ? `Cada real de captação volta ${numero(retorno, 1)}× em mensalidade. Há folga para investir mais.`
        : retorno >= 1
          ? `Cada real de captação volta ${numero(retorno, 1)}×. Abaixo de 3× a margem não sustenta aumento de verba — mexa em retenção antes de mexer em anúncio.`
          : `A captação custa mais do que o aluno devolve (${numero(retorno, 1)}×). Revise canal e oferta antes de aumentar verba.`,
    );
  } else if (investimento === 0) {
    leitura.push(
      "Nenhuma despesa de marketing lançada no período — sem isso não há CAC nem retorno. Lance o gasto em Custos com a categoria \"Marketing\".",
    );
  }
  if (temposDeFechamento.length) {
    leitura.push(
      `Do primeiro contato à matrícula: ${numero(tempoMedioFechar, 0)} dias em média (mediana ${numero(tempoMedianoFechar, 0)}). É a janela em que o follow-up ainda vale.`,
    );
  }
  if (motivosOrdenados.length) {
    leitura.push(
      `Motivo de perda mais frequente: "${motivosOrdenados[0][0]}" (${motivosOrdenados[0][1]} de ${perdidos.length}).`,
    );
  }
  const publicoTotal = recentes.length + mornos.length + ausentes.length + aniversariantes.length;
  if (publicoTotal > 0) {
    leitura.push(
      `Públicos prontos para campanha: ${recentes.length} cancelamento(s) recente(s), ${mornos.length} morno(s), ${ausentes.length} aluno(s) ausente(s) há 7+ dias e ${aniversariantes.length} aniversariante(s) no mês que vem. As listas saem na exportação em planilha.`,
    );
  }

  /* ---------- blocos ---------- */
  const blocos: Bloco[] = [
    { tipo: "indicadores", titulo: "Indicadores do período", itens: indicadores },
    {
      tipo: "barras",
      titulo: "Funil da safra",
      nota: "Onde estão hoje os leads captados dentro do período.",
      itens: funil,
    },
    {
      tipo: "tabela",
      titulo: "Desempenho por canal",
      nota: "Conversão é da safra do período; receita é a mensalidade das matrículas feitas no período.",
      colunas: [
        { rotulo: "Canal", peso: 1.6 },
        { rotulo: "Leads", alinhamento: "direita" },
        { rotulo: "Viraram aluno", alinhamento: "direita", peso: 1.2 },
        { rotulo: "Conversão", alinhamento: "direita" },
        { rotulo: "Receita/mês", alinhamento: "direita", peso: 1.2 },
      ],
      linhas: porCanal.map((c) => [
        ORIGEM_LABEL[c.origem],
        inteiro(c.leads),
        inteiro(c.convertidos),
        c.leads ? pct(c.conversao, 0) : "—",
        moeda(c.receita),
      ]),
      vazio: "Nenhum lead captado no período.",
    },
    {
      tipo: "tabela",
      titulo: "Quem fechou",
      nota: "Matrículas do período por quem operou a matrícula.",
      colunas: [
        { rotulo: "Consultor", peso: 2 },
        { rotulo: "Matrículas", alinhamento: "direita" },
        { rotulo: "Receita/mês", alinhamento: "direita" },
        { rotulo: "Ticket médio", alinhamento: "direita" },
      ],
      linhas: consultores.map((c) => [
        c.nome,
        inteiro(c.matriculas),
        moeda(c.receita),
        moeda(razao(c.receita, c.matriculas)),
      ]),
      vazio: "Nenhuma matrícula no período.",
    },
    {
      tipo: "barras",
      titulo: "Retenção por tempo de casa",
      nota: "% da coorte que continua ativa. Marketing que traz aluno que não fica é custo, não investimento.",
      itens: coorte,
    },
    {
      tipo: "barras",
      titulo: "Mix de fidelidade da base ativa",
      itens: mix,
    },
    {
      tipo: "tabela",
      titulo: "Motivos de perda",
      nota: "Leads captados no período que foram marcados como perdidos. O sistema não guarda a data da perda — a safra é a de captação.",
      colunas: [
        { rotulo: "Motivo", peso: 3 },
        { rotulo: "Leads", alinhamento: "direita" },
        { rotulo: "Peso", alinhamento: "direita" },
      ],
      linhas: motivosOrdenados.map(([motivo, qtd]) => [
        motivo,
        inteiro(qtd),
        pct(percentual(qtd, perdidos.length), 0),
      ]),
      vazio: "Nenhum lead perdido no período.",
    },
    {
      tipo: "barras",
      titulo: "Públicos prontos para campanha",
      nota: "Listas nominais saem na exportação em planilha (CSV).",
      itens: [
        {
          rotulo: "Win-back quente",
          valor: recentes.length,
          exibicao: `${inteiro(recentes.length)} · cancelou há menos de 2 meses`,
          tom: "ok",
        },
        {
          rotulo: "Win-back morno",
          valor: mornos.length,
          exibicao: `${inteiro(mornos.length)} · 2 a 6 meses parado`,
          tom: "alerta",
        },
        {
          rotulo: "Win-back frio",
          valor: frios.length,
          exibicao: `${inteiro(frios.length)} · 6+ meses parado`,
          tom: "neutro",
        },
        {
          rotulo: "Ausentes 7+ dias",
          valor: ausentes.length,
          exibicao: `${inteiro(ausentes.length)} · aluno ativo que parou de vir`,
          tom: "risco",
        },
        {
          rotulo: "Aniversariantes",
          valor: aniversariantes.length,
          exibicao: `${inteiro(aniversariantes.length)} · no mês seguinte`,
          tom: "neutro",
        },
      ],
    },
  ];

  if (leitura.length) {
    blocos.push({ tipo: "texto", titulo: "Leitura do período", paragrafos: leitura });
  }

  /* ---------- planilhas ---------- */
  const planilhas: Planilha[] = [
    {
      nome: "leads-captados",
      titulo: "Leads captados no período",
      colunas: ["Código", "Nome", "Telefone", "E-mail", "Canal", "Estágio", "Cadastro", "Motivo da perda"],
      linhas: safra.map((p) => [
        p.codigo,
        p.nome,
        telefone(p),
        p.email ?? "",
        ORIGEM_LABEL[p.origem],
        p.fase === "aluno" ? "Matriculado" : (p.estagio ?? "novo"),
        dataCurta(p.criadoEm),
        p.motivoPerdido ?? "",
      ]),
    },
    {
      nome: "matriculas",
      titulo: "Matrículas do período",
      colunas: ["Código", "Nome", "Telefone", "Canal", "Plano", "Mensalidade", "Matrícula", "Dias até fechar", "Consultor"],
      linhas: matriculas.map((p) => [
        p.codigo,
        p.nome,
        telefone(p),
        ORIGEM_LABEL[p.origem],
        planoDe(p.planoId),
        moeda(valorMensal(p.planoId)),
        dataCurta(p.matriculadoEm),
        numero(diasEntreIso(p.criadoEm, p.matriculadoEm), 0),
        p.matriculadoPor ?? p.vendedor ?? "",
      ]),
    },
    {
      nome: "reativacao",
      titulo: "Base de reativação (cancelados)",
      colunas: ["Código", "Nome", "Telefone", "Último plano", "Última presença", "Meses parado", "Janela"],
      linhas: reativacao.map(({ pessoa, meses }) => [
        pessoa.codigo,
        pessoa.nome,
        telefone(pessoa),
        planoDe(pessoa.planoId),
        dataCurta(pessoa.ultimaPresenca),
        inteiro(meses),
        meses < 2 ? "Quente" : meses < 6 ? "Morno" : "Frio",
      ]),
    },
    {
      nome: "ausentes",
      titulo: "Alunos ativos ausentes (7+ dias)",
      colunas: ["Código", "Nome", "Telefone", "Plano", "Última presença", "Dias sem vir"],
      linhas: ausentes.map(({ pessoa, dias }) => [
        pessoa.codigo,
        pessoa.nome,
        telefone(pessoa),
        planoDe(pessoa.planoId),
        dataCurta(pessoa.ultimaPresenca),
        inteiro(dias),
      ]),
    },
    {
      nome: "aniversariantes",
      titulo: "Aniversariantes do mês seguinte",
      colunas: ["Código", "Nome", "Telefone", "Situação", "Aniversário"],
      linhas: aniversariantes.map((p) => [
        p.codigo,
        p.nome,
        telefone(p),
        p.fase === "aluno" ? (p.status ?? "ativo") : "lead",
        (() => {
          const md = mesDiaNascimento(p.dataNascimento);
          return md ? `${md.slice(3)}/${md.slice(0, 2)}` : "";
        })(),
      ]),
    },
  ];

  const observacoes = [
    "Safra = pessoas cadastradas dentro do período; é a coorte que dá para acompanhar de ponta a ponta.",
    `Investimento em marketing = despesas do período cuja categoria cita marketing, tráfego, anúncio, mídia ou rede social${
      categoriasEncontradas.length ? ` (encontradas: ${categoriasEncontradas.join(", ")})` : ""
    }.`,
    "LTV = ticket médio da base ativa × vida média dos alunos que já cancelaram.",
  ];

  return {
    tipo: "marketing",
    titulo: "Relatório de Marketing",
    periodo: periodo.rotulo,
    geradoEm: dataHora(ctx.agora ?? new Date()),
    geradoPor: ctx.geradoPor,
    observacoes,
    blocos,
    planilhas,
  };
}
