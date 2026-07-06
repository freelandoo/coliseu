import type {
  Aluno,
  Candidato,
  Cobranca,
  Lead,
  Plano,
  PontoMensal,
} from "./types";
import { LEAD_ESTAGIO_LABEL, ORIGEM_LABEL } from "./types";

// Data de referência fixa para manter SSR determinístico (sem mismatch de hidratação).
export const HOJE = new Date("2026-06-28T12:00:00-03:00");

function isoOffsetDays(days: number): string {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export const planosSeed: Plano[] = [
  { id: "p-mensal", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1 },
  { id: "p-tri", nome: "Trimestral", valorMensal: 109.9, duracaoMeses: 3 },
  { id: "p-semestral", nome: "Semestral", valorMensal: 94.9, duracaoMeses: 6 },
  { id: "p-anual", nome: "Anual", valorMensal: 79.9, duracaoMeses: 12 },
];

export const leads: Lead[] = [
  { id: "l-01", nome: "Marina Alves", telefone: "(11) 98123-4501", origem: "whatsapp", estagio: "novo", criadoEm: isoOffsetDays(-1) },
  { id: "l-02", nome: "Diego Martins", telefone: "(11) 98123-4502", origem: "indicacao", estagio: "novo", criadoEm: isoOffsetDays(0) },
  { id: "l-03", nome: "Rafael Souza", telefone: "(11) 98123-4503", origem: "redes", estagio: "qualificado", criadoEm: isoOffsetDays(-2) },
  { id: "l-04", nome: "Bianca Lima", telefone: "(11) 98123-4504", origem: "balcao", estagio: "qualificado", criadoEm: isoOffsetDays(-3) },
  { id: "l-05", nome: "Thiago Nunes", telefone: "(11) 98123-4505", origem: "whatsapp", estagio: "interesse", criadoEm: isoOffsetDays(-4) },
  { id: "l-06", nome: "Camila Rocha", telefone: "(11) 98123-4506", origem: "redes", estagio: "interesse", criadoEm: isoOffsetDays(-5) },
  { id: "l-07", nome: "Pedro Henrique", telefone: "(11) 98123-4507", origem: "indicacao", estagio: "convertido", criadoEm: isoOffsetDays(-9) },
  { id: "l-08", nome: "Larissa Dias", telefone: "(11) 98123-4508", origem: "balcao", estagio: "perdido", motivoPerdido: "Achou o valor alto", criadoEm: isoOffsetDays(-7) },
  { id: "l-09", nome: "Gustavo Reis", telefone: "(11) 98123-4509", origem: "whatsapp", estagio: "perdido", motivoPerdido: "Sem retorno após 3 contatos", criadoEm: isoOffsetDays(-12) },
];

export const alunos: Aluno[] = [
  { id: "a-01", codigo: "CD00001", nome: "Pedro Henrique", telefone: "(11) 98123-4507", email: "pedro@email.com", cpf: "312.456.789-01", planoId: "p-anual", status: "ativo", matriculadoEm: isoOffsetDays(-9), vencimentoPlano: isoOffsetDays(356), ultimaPresenca: isoOffsetDays(-1) },
  { id: "a-02", codigo: "CD00002", nome: "Juliana Castro", telefone: "(11) 98123-4510", email: "juliana@email.com", cpf: "423.567.890-12", planoId: "p-mensal", status: "ativo", matriculadoEm: isoOffsetDays(-20), vencimentoPlano: isoOffsetDays(10), ultimaPresenca: isoOffsetDays(0) },
  { id: "a-03", codigo: "CD00003", nome: "Anderson Pinto", telefone: "(11) 98123-4511", email: "anderson@email.com", cpf: "534.678.901-23", planoId: "p-tri", status: "pendente", matriculadoEm: isoOffsetDays(-1), vencimentoPlano: isoOffsetDays(89), ultimaPresenca: isoOffsetDays(-1) },
  { id: "a-04", codigo: "CD00004", nome: "Fernanda Melo", telefone: "(11) 98123-4512", email: "fernanda@email.com", cpf: "645.789.012-34", planoId: "p-mensal", status: "inadimplente", matriculadoEm: isoOffsetDays(-65), vencimentoPlano: isoOffsetDays(-5), ultimaPresenca: isoOffsetDays(-9) },
  { id: "a-05", codigo: "CD00005", nome: "Lucas Ferreira", telefone: "(11) 98123-4513", email: "lucas@email.com", cpf: "756.890.123-45", planoId: "p-semestral", status: "ativo", matriculadoEm: isoOffsetDays(-40), vencimentoPlano: isoOffsetDays(140), ultimaPresenca: isoOffsetDays(-8) },
  { id: "a-06", codigo: "CD00006", nome: "Patrícia Gomes", telefone: "(11) 98123-4514", email: "patricia@email.com", cpf: "867.901.234-56", planoId: "p-mensal", status: "ativo", matriculadoEm: isoOffsetDays(-33), vencimentoPlano: isoOffsetDays(3), ultimaPresenca: isoOffsetDays(-15) },
  { id: "a-07", codigo: "CD00007", nome: "Rodrigo Barros", telefone: "(11) 98123-4515", email: "rodrigo@email.com", cpf: "978.012.345-67", planoId: "p-tri", status: "ativo", matriculadoEm: isoOffsetDays(-80), vencimentoPlano: isoOffsetDays(10), ultimaPresenca: isoOffsetDays(-22) },
  { id: "a-08", codigo: "CD00008", nome: "Aline Cardoso", telefone: "(11) 98123-4516", email: "aline@email.com", cpf: "089.123.456-78", planoId: "p-mensal", status: "inadimplente", matriculadoEm: isoOffsetDays(-95), vencimentoPlano: isoOffsetDays(-12), ultimaPresenca: isoOffsetDays(-30) },
];

export const cobrancas: Cobranca[] = [
  { id: "c-01", alunoId: "a-01", tipo: "matricula", valor: 79.9, vencimento: isoOffsetDays(-9), status: "pago", asaasId: "pay_001" },
  { id: "c-02", alunoId: "a-02", tipo: "mensalidade", valor: 129.9, vencimento: isoOffsetDays(2), status: "pendente", asaasId: "pay_002", linkPagamento: "https://asaas.com/c/pay_002" },
  { id: "c-03", alunoId: "a-03", tipo: "matricula", valor: 109.9, vencimento: isoOffsetDays(1), status: "pendente", asaasId: null, linkPagamento: "https://asaas.com/c/pay_003" },
  { id: "c-04", alunoId: "a-04", tipo: "mensalidade", valor: 129.9, vencimento: isoOffsetDays(-5), status: "atrasado", asaasId: "pay_004" },
  { id: "c-05", alunoId: "a-06", tipo: "mensalidade", valor: 129.9, vencimento: isoOffsetDays(3), status: "pendente", asaasId: "pay_006", linkPagamento: "https://asaas.com/c/pay_006" },
  { id: "c-06", alunoId: "a-08", tipo: "mensalidade", valor: 129.9, vencimento: isoOffsetDays(-12), status: "atrasado", asaasId: "pay_008" },
  { id: "c-07", alunoId: "a-05", tipo: "mensalidade", valor: 94.9, vencimento: isoOffsetDays(8), status: "pendente", asaasId: "pay_005", linkPagamento: "https://asaas.com/c/pay_005" },
];

// ---------- helpers ----------

export function alunoPorId(id: string): Aluno | undefined {
  return alunos.find((a) => a.id === id);
}

export function diasEntre(isoA: string, base: Date = HOJE): number {
  const a = new Date(isoA).getTime();
  const ms = base.getTime() - a;
  return Math.round(ms / 86_400_000);
}

/** Dias sem comparecer (positivo = ausente há N dias). */
export function diasSemPresenca(aluno: Aluno): number {
  return Math.max(0, diasEntre(aluno.ultimaPresenca));
}

/** Faixa de ausência do fluxograma: 7 / 14 / 21 dias. */
export function faixaAusencia(dias: number): 7 | 14 | 21 | null {
  if (dias >= 21) return 21;
  if (dias >= 14) return 14;
  if (dias >= 7) return 7;
  return null;
}

/** Próximo código de cadastro sequencial (CD00001, CD00002, …). */
export function proximoCodigoCadastro(
  existentes: { codigo?: string }[] = alunos,
): string {
  const maior = existentes.reduce((max, a) => {
    const n = Number(a.codigo?.replace(/\D/g, "") ?? 0);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `CD${String(maior + 1).padStart(5, "0")}`;
}

/** Aluno precisa renovar: inadimplente/cancelado ou plano vencendo em ≤15 dias. */
export function precisaRenovar(a: Aluno): boolean {
  if (a.status === "inadimplente" || a.status === "cancelado") return true;
  return diasEntre(a.vencimentoPlano) >= -15;
}

/**
 * Candidatos à matrícula: leads em aberto (não perdidos/convertidos) e
 * alunos que precisam renovar. É o pool buscável do Estágio 2.
 */
export function candidatosMatricula(): Candidato[] {
  const doLead: Candidato[] = leads
    .filter((l) => ["novo", "qualificado", "interesse"].includes(l.estagio))
    .map((l) => ({
      refId: l.id,
      origem: "lead",
      nome: l.nome,
      telefone: l.telefone,
      detalhe: `Lead · ${ORIGEM_LABEL[l.origem]} · ${LEAD_ESTAGIO_LABEL[l.estagio]}`,
    }));

  const doAluno: Candidato[] = alunos.filter(precisaRenovar).map((a) => {
    const dias = diasEntre(a.vencimentoPlano);
    const situacao =
      a.status === "inadimplente"
        ? "inadimplente"
        : a.status === "cancelado"
          ? "cancelado"
          : dias >= 0
            ? `venceu há ${dias}d`
            : `vence em ${-dias}d`;
    return {
      refId: a.id,
      origem: "renovacao",
      nome: a.nome,
      telefone: a.telefone,
      email: a.email,
      cpf: a.cpf,
      planoAtualId: a.planoId,
      detalhe: `Renovação · ${situacao}`,
    };
  });

  return [...doLead, ...doAluno];
}

/**
 * Série mensal para os relatórios (evolução de matrículas, receita e cancelamentos).
 *
 * MOCK: valores sintéticos e determinísticos (ancorados em HOJE, sem Math.random,
 * para não quebrar a hidratação do SSR). Em PRODUÇÃO, troque APENAS o corpo desta
 * função por uma agregação real — o tipo de retorno (PontoMensal[]) e a assinatura
 * permanecem iguais, então os gráficos não precisam mudar. Ex. (Postgres):
 *
 *   SELECT date_trunc('month', matriculado_em) AS mes,
 *          count(*)                              AS matriculas
 *   FROM alunos GROUP BY 1 ORDER BY 1;
 *   -- receita = MRR acumulado por mês; cancelamentos = count por mês de cancelamento.
 */
export function serieMensal(qtdeMeses = 6): PontoMensal[] {
  const matriculas = [2, 3, 2, 4, 3, 5];
  const receita = [420, 540, 610, 720, 810, 914.2];
  const cancelamentos = [0, 1, 0, 1, 1, 0];

  const pts: PontoMensal[] = [];
  for (let i = qtdeMeses - 1; i >= 0; i--) {
    const d = new Date(HOJE);
    d.setMonth(d.getMonth() - i);
    const idx = qtdeMeses - 1 - i;
    pts.push({
      mes: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      matriculas: matriculas[idx] ?? 0,
      receita: receita[idx] ?? 0,
      cancelamentos: cancelamentos[idx] ?? 0,
    });
  }
  return pts;
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

