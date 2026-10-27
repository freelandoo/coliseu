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
 *   8..60 ..... INADIMPLENTE: o Asaas para de avisar e a cobrança é manual
 *   61+ ....... INATIVO: sai da lista de inadimplentes
 *
 * Funções puras: quem chama traz as datas do banco.
 */

/** Dias de carência na catraca depois do vencimento (parcela ou plano). */
export const CARENCIA_DIAS = 3;
/** Lembrete antecipado do Asaas (o Asaas só aceita 0/5/10/15/30). */
export const AVISO_ANTES_DIAS = 5;
/** Até quantos dias de atraso o Asaas cobra sozinho. */
export const COBRANCA_AUTOMATICA_ATE_DIAS = 7;
/** Até quantos dias de atraso o aluno fica na lista de inadimplentes. */
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

export type EtapaCobranca = "em_dia" | "cobranca_automatica" | "inadimplente" | "inativo";

/** Em que ponto da régua está quem tem uma parcela `diasAtraso` dias vencida. */
export function etapaDaCobranca(diasAtraso: number | null): EtapaCobranca {
  if (diasAtraso == null || diasAtraso <= 0) return "em_dia";
  if (diasAtraso <= COBRANCA_AUTOMATICA_ATE_DIAS) return "cobranca_automatica";
  if (diasAtraso <= INADIMPLENTE_ATE_DIAS) return "inadimplente";
  return "inativo";
}

type StatusMatricula = "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELED" | "EXPIRED";
export type SituacaoAluno = "ativo" | "pendente" | "inadimplente" | "inativo" | "cancelado";

/**
 * Situação do aluno na régua. Matrícula ativa com parcela vencida há 8–60 dias
 * é inadimplente (e segue contando como ativa, como no CloudGym); passou de 60,
 * ou o plano venceu além da carência sem assinatura que renove sozinha, é
 * inativo — mesmo antes de a rotina de vencimento gravar EXPIRED.
 */
export function situacaoDoAluno(i: {
  matricula: StatusMatricula;
  /** Dias de atraso da parcela aberta mais antiga (null = nenhuma aberta). */
  diasAtrasoParcela: number | null;
  diasAposVencimentoPlano: number | null;
  /** Assinatura real no Asaas: a mensalidade paga empurra o vencimento do plano. */
  renovaSozinho: boolean;
}): SituacaoAluno {
  switch (i.matricula) {
    case "CANCELED":
      return "cancelado";
    case "DRAFT":
    case "PENDING_PAYMENT":
      return "pendente";
    case "EXPIRED":
    case "SUSPENDED":
      return "inativo";
  }
  const etapa = etapaDaCobranca(i.diasAtrasoParcela);
  if (etapa === "inativo") return "inativo";
  if (etapa === "inadimplente") return "inadimplente";
  if (!i.renovaSozinho && (i.diasAposVencimentoPlano ?? 0) > CARENCIA_DIAS) return "inativo";
  return "ativo";
}

/** Conta como ativo no total (o CloudGym conta o inadimplente entre os ativos). */
export function contaComoAtivo(s: SituacaoAluno | undefined): boolean {
  return s === "ativo" || s === "inadimplente";
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
