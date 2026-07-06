import type {
  Aluno,
  Candidato,
  Lead,
  PontoMensal,
} from "./types";
import { LEAD_ESTAGIO_LABEL, ORIGEM_LABEL } from "./types";

// Data de referência fixa para manter SSR determinístico (sem mismatch de hidratação).
export const HOJE = new Date("2026-06-28T12:00:00-03:00");

export function isoOffsetDays(days: number): string {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ---------- helpers ----------

export function alunoPorId(
  id: string,
  existentes: { id: string }[],
): Aluno | undefined {
  return existentes.find((a) => a.id === id) as Aluno | undefined;
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
  existentes: { codigo?: string }[],
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
export function candidatosMatricula(leads: Lead[], alunos: Aluno[]): Candidato[] {
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

