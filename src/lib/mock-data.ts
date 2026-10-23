import type {
  Aluno,
  Candidato,
  Lead,
} from "./types";
import { LEAD_ESTAGIO_LABEL, ORIGEM_LABEL } from "./types";

// ---------- helpers ----------

export function alunoPorId(
  id: string,
  existentes: { id: string }[],
): Aluno | undefined {
  return existentes.find((a) => a.id === id) as Aluno | undefined;
}

/** Dias de `isoA` até `base` (padrão: agora). Positivo = no passado. */
export function diasEntre(isoA: string, base: Date = new Date()): number {
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

