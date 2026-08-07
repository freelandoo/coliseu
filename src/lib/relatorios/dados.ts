/**
 * A base de um relatório, num objeto só.
 *
 * Os montadores (`marketing.ts`, `financeiro.ts`) são funções puras sobre esta
 * estrutura — é o que permite testá-los com uma base de mentira, sem Postgres,
 * e o que impede um `prisma.` de aparecer no meio de uma conta de CAC.
 */

import { listarAulasExperimentais, listarDespesas, listarPessoas, listarPlanos } from "@/lib/store";
import { cobrancasRelatorioRepo, type CobrancaRelatorio } from "@/lib/repositories/relatorios";
import type { AulaExperimentalItem, Despesa, Pessoa, Plano } from "@/lib/types";

export type { CobrancaRelatorio };

export interface DadosRelatorio {
  pessoas: Pessoa[];
  planos: Plano[];
  cobrancas: CobrancaRelatorio[];
  despesas: Despesa[];
  aulas: AulaExperimentalItem[];
}

export async function carregarDadosRelatorio(): Promise<DadosRelatorio> {
  const [pessoas, planos, cobrancas, despesas, aulas] = await Promise.all([
    listarPessoas(),
    listarPlanos(),
    cobrancasRelatorioRepo(),
    listarDespesas(),
    listarAulasExperimentais(),
  ]);
  return { pessoas, planos, cobrancas, despesas, aulas };
}

/* ---------- recortes que os dois relatórios usam ---------- */

/** Quanto vale o plano por mês. Plano apagado vale zero, não quebra a conta. */
export function valorDoPlano(planos: Plano[]): (planoId: string | undefined) => number {
  const porId = new Map(planos.map((p) => [p.id, p]));
  return (planoId) => (planoId ? (porId.get(planoId)?.valorMensal ?? 0) : 0);
}

export function nomeDoPlano(planos: Plano[]): (planoId: string | undefined) => string {
  const porId = new Map(planos.map((p) => [p.id, p]));
  return (planoId) => (planoId ? (porId.get(planoId)?.nome ?? "—") : "—");
}

/** Alunos que contam como base: matriculados que não cancelaram. */
export function baseAtiva(pessoas: Pessoa[]): Pessoa[] {
  return pessoas.filter((p) => p.fase === "aluno" && p.status !== "cancelado");
}

export function cancelados(pessoas: Pessoa[]): Pessoa[] {
  return pessoas.filter((p) => p.fase === "aluno" && p.status === "cancelado");
}
