/**
 * Régua de cobrança e situação do aluno — igual à do CloudGym (decisão do
 * Alex, 27/10/2026). Contada em dias corridos desde o vencimento da parcela
 * aberta mais antiga:
 *
 *   -5 ........ lembrete do Asaas (5 dias antes)
 *    0 ........ lembrete no dia do vencimento
 *   1..3 ...... catraca libera na carência (a recepção vê o aviso)
 *   4 ......... catraca bloqueia
 *   1..7 ...... cobrança automática do Asaas (vencida + 7 dias depois)
 *   8+ ........ INADIMPLENTE: o Asaas para de avisar e a cobrança é manual
 *
 * O contrato decide o resto (Alex, 27/10/2026): com contrato vigente (plano de
 * 1 ano ainda valendo, p.ex.) o aluno é inadimplente e segue ATIVO, por mais
 * velha que seja a parcela. Sem contrato (plano vencido), fica na lista de
 * inadimplentes até 60 dias de atraso e depois vira INATIVO.
 *
 * Funções puras: quem chama traz as datas do banco.
 */

/** Dias de carência na catraca depois do vencimento (parcela ou plano). */
export const CARENCIA_DIAS = 3;
/** Lembrete antecipado do Asaas (o Asaas só aceita 0/5/10/15/30). */
export const AVISO_ANTES_DIAS = 5;
/** Até quantos dias de atraso o Asaas cobra sozinho. */
export const COBRANCA_AUTOMATICA_ATE_DIAS = 7;
/** Sem contrato vigente, até quantos dias de atraso o aluno fica nos inadimplentes. */
export const INADIMPLENTE_ATE_DIAS = 60;

const UM_DIA = 86_400_000;

/** Meia-noite UTC do dia de hoje em São Paulo — a "data" de hoje na academia. */
function hojeSaoPaulo(agora: Date): number {
  const [a, m, d] = agora
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  return Date.UTC(a, m - 1, d);
}

/**
 * Dias corridos desde `vencimento` (>0 = vencido; 0 = vence hoje; <0 = falta).
 * O vencimento é uma data (gravada à meia-noite ou ao meio-dia UTC): vale o
 * dia do calendário, não a hora.
 */
export function diasDesde(vencimento: Date, agora = new Date()): number {
  const venc = Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate());
  return Math.round((hojeSaoPaulo(agora) - venc) / UM_DIA);
}

type StatusMatricula = "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELED" | "EXPIRED";
export type SituacaoAluno = "ativo" | "pendente" | "inadimplente" | "inativo" | "cancelado";

export interface DadosSituacao {
  matricula: StatusMatricula;
  /** Dias de atraso da parcela aberta mais antiga (null = nenhuma aberta). */
  diasAtrasoParcela: number | null;
  diasAposVencimentoPlano: number | null;
  /** Assinatura real no Asaas: a mensalidade paga empurra o vencimento do plano. */
  renovaSozinho: boolean;
}

/**
 * Contrato vigente: matrícula ativa com o plano valendo (ou na carência), ou
 * com assinatura que renova sozinha. É o que o CloudGym conta como ativo.
 */
export function temContratoVigente(i: DadosSituacao): boolean {
  if (i.matricula !== "ACTIVE") return false;
  return i.renovaSozinho || (i.diasAposVencimentoPlano ?? 0) <= CARENCIA_DIAS;
}

/**
 * Situação do aluno na régua:
 * - contrato vigente: inadimplente com parcela vencida há 8+ dias, senão ativo;
 * - sem contrato: inadimplente enquanto a parcela vencida tiver até 60 dias,
 *   depois (ou sem dívida) inativo.
 */
export function situacaoDoAluno(i: DadosSituacao): SituacaoAluno {
  switch (i.matricula) {
    case "CANCELED":
      return "cancelado";
    case "DRAFT":
    case "PENDING_PAYMENT":
      return "pendente";
  }
  const atraso = i.diasAtrasoParcela ?? 0;
  if (temContratoVigente(i)) return atraso > COBRANCA_AUTOMATICA_ATE_DIAS ? "inadimplente" : "ativo";
  return atraso > 0 && atraso <= INADIMPLENTE_ATE_DIAS ? "inadimplente" : "inativo";
}

/**
 * Conta como ativo no total: contrato vigente, em dia ou inadimplente (como no
 * CloudGym). "ativo" sempre tem contrato; o inadimplente sem contrato fica fora.
 */
export function contaComoAtivo(p: { status?: SituacaoAluno; contratoVigente?: boolean }): boolean {
  return p.status === "ativo" || (p.status === "inadimplente" && p.contratoVigente !== false);
}

/**
 * Aviso da carência para a recepção quando o aluno entra com a parcela (ou o
 * plano) vencida. `null` = fora da carência (em dia, ou já bloqueado).
 */
export function avisoDeCarencia(diasAtraso: number): { restam: number; texto: string } | null {
  if (diasAtraso <= 0 || diasAtraso > CARENCIA_DIAS) return null;
  const restam = CARENCIA_DIAS - diasAtraso + 1;
  if (restam === CARENCIA_DIAS) return { restam, texto: `Matrícula vencida. ${CARENCIA_DIAS} dias de carência a partir de hoje.` };
  if (restam > 1) return { restam, texto: `Matrícula vencida. Restam ${restam} dias de carência.` };
  return { restam, texto: "Matrícula vencida. Último dia de carência: amanhã o acesso será bloqueado." };
}
