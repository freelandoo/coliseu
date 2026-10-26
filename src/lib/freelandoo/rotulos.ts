/**
 * Rótulos e contas da tela para a conta Freelandoo — puro, sem prisma, para o
 * client (lista de alunos e ficha) importar à vontade.
 */

export type EstadoFreelandoo =
  | "sem_conta"
  | "falta_dado"
  | "menor"
  | "aguardando_aceite"
  | "ativa"
  | "conflito_email"
  | "falhou";

export const ESTADO_FREELANDOO_LABEL: Record<EstadoFreelandoo, string> = {
  sem_conta: "Sem conta",
  falta_dado: "Falta dado",
  menor: "Menor de idade",
  aguardando_aceite: "Aguardando aceite",
  ativa: "Conta ativa",
  conflito_email: "E-mail em uso",
  falhou: "Falhou",
};

export const ESTADO_FREELANDOO_TOM: Record<
  EstadoFreelandoo,
  "neutral" | "ok" | "warn" | "danger" | "info"
> = {
  sem_conta: "neutral",
  falta_dado: "warn",
  menor: "neutral",
  aguardando_aceite: "info",
  ativa: "ok",
  conflito_email: "danger",
  falhou: "danger",
};

/** Motivo gravado em `freelandooMotivo` → frase da ficha. */
export const MOTIVO_FREELANDOO_LABEL: Record<string, string> = {
  nao_e_aluno: "Só alunos ganham conta.",
  matricula_invalida: "A matrícula não está válida.",
  falta_cpf: "Falta o CPF no cadastro.",
  cpf_invalido: "O CPF do cadastro é inválido.",
  falta_email: "Falta o e-mail no cadastro.",
  falta_nascimento: "Falta a data de nascimento no cadastro.",
  menor: "Menor de idade — a conta pelo responsável fica para uma fase futura.",
  dados_incompletos: "A Freelandoo recusou o cadastro: dados incompletos.",
  email_em_uso: "Este e-mail já é de outra conta na Freelandoo (CPF diferente). Corrija o e-mail e tente de novo.",
};

export function motivoFreelandoo(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  return MOTIVO_FREELANDOO_LABEL[motivo] ?? motivo;
}

const DIA_MS = 86_400_000;

export interface BarraTreino {
  /** "sem_treino" quando a Freelandoo não tem treino ativo. */
  situacao: "sem_treino" | "em_dia" | "vencendo" | "vencido";
  /** 0..1 — dias restantes ÷ validade. */
  proporcao: number;
  diasRestantes: number | null;
  /** Texto acessível: "Treino vence em 12 dias". */
  texto: string;
}

/** Abaixo disto (fração da validade) a barra avisa que está acabando. */
const LIMIAR_VENCENDO = 0.2;

/**
 * Barrinha da validade do treino ativo (decisão Q8): proporção de dias que
 * faltam sobre a validade escolhida na Freelandoo (30/60/90).
 */
export function barraTreino(
  venceEm: string | Date | null | undefined,
  validadeDias: number | null | undefined,
  agora: Date = new Date(),
): BarraTreino {
  if (!venceEm) return { situacao: "sem_treino", proporcao: 0, diasRestantes: null, texto: "Sem treino" };
  const vence = venceEm instanceof Date ? venceEm : new Date(venceEm);
  if (Number.isNaN(vence.getTime())) {
    return { situacao: "sem_treino", proporcao: 0, diasRestantes: null, texto: "Sem treino" };
  }
  const restantes = Math.ceil((vence.getTime() - agora.getTime()) / DIA_MS);
  if (restantes <= 0) {
    const ha = Math.abs(restantes);
    return {
      situacao: "vencido",
      proporcao: 0,
      diasRestantes: restantes,
      texto: ha === 0 ? "Treino venceu hoje" : `Treino vencido há ${ha} dia${ha === 1 ? "" : "s"}`,
    };
  }
  const validade = validadeDias && validadeDias > 0 ? validadeDias : 60;
  const proporcao = Math.min(1, restantes / validade);
  return {
    situacao: proporcao <= LIMIAR_VENCENDO ? "vencendo" : "em_dia",
    proporcao,
    diasRestantes: restantes,
    texto: `Treino vence em ${restantes} dia${restantes === 1 ? "" : "s"}`,
  };
}

export type FiltroApp = "todos" | "na_freelandoo" | "sem_conta" | "falta_dado" | "treino_vencido";

/** Filtros da lista de alunos (Q15). `estado` ausente = sem conta. */
export function combinaFiltroApp(
  conta: { estado: EstadoFreelandoo; treinoVenceEm?: string } | undefined,
  filtro: FiltroApp,
  agora: Date = new Date(),
): boolean {
  const estado = conta?.estado ?? "sem_conta";
  switch (filtro) {
    case "todos":
      return true;
    case "na_freelandoo":
      return estado === "ativa" || estado === "aguardando_aceite";
    case "sem_conta":
      return estado === "sem_conta";
    case "falta_dado":
      return estado === "falta_dado";
    case "treino_vencido":
      return estado === "ativa" && treinoVencido(conta?.treinoVenceEm, agora);
  }
}

/**
 * Situação do aluno na aba Treinos — a mesma régua da fila do professor na
 * Freelandoo (utils/trainingQueue.js de lá): vencido, vencendo (barrinha no
 * fim) e sem treino entram; ficha do professor esperando o aluno confirmar
 * vira "aguardando_aluno" (o professor já fez a parte dele). Quem não tem conta
 * na Freelandoo não tem onde receber treino: "sem_conta". Em dia = null.
 */
export type SituacaoTreino = "vencido" | "vencendo" | "sem_treino" | "aguardando_aluno" | "sem_conta";

export function situacaoTreino(
  conta: { estado: EstadoFreelandoo; treinoVenceEm?: string; treinoValidadeDias?: number; treinoPropostaPendente?: boolean } | undefined,
  agora: Date = new Date(),
): SituacaoTreino | null {
  const estado = conta?.estado ?? "sem_conta";
  if (estado !== "ativa" && estado !== "aguardando_aceite") return "sem_conta";
  if (conta?.treinoPropostaPendente) return "aguardando_aluno";
  const b = barraTreino(conta?.treinoVenceEm, conta?.treinoValidadeDias, agora);
  return b.situacao === "em_dia" ? null : b.situacao;
}

export function treinoVencido(venceEm: string | Date | null | undefined, agora: Date = new Date()): boolean {
  return barraTreino(venceEm, null, agora).situacao === "vencido";
}
