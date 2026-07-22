// ============================================================
// Modelo de domínio — CRM Academia Coliseu Team
// Espelha o fluxograma: Captação → Matrícula → Cobrança → Retenção
// ============================================================

export type Origem = "whatsapp" | "redes" | "balcao" | "indicacao";

export const ORIGEM_LABEL: Record<Origem, string> = {
  whatsapp: "WhatsApp",
  redes: "Redes sociais",
  balcao: "Balcão",
  indicacao: "Indicação",
};

// Estágio 1 — funil de captação
export type LeadEstagio =
  | "novo"
  | "qualificado"
  | "interesse"
  | "perdido"
  | "convertido";

export const LEAD_ESTAGIO_LABEL: Record<LeadEstagio, string> = {
  novo: "Lead novo",
  qualificado: "Qualificado",
  interesse: "Com interesse",
  perdido: "Perdido",
  convertido: "Convertido",
};

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  origem: Origem;
  estagio: LeadEstagio;
  motivoPerdido?: string;
  criadoEm: string; // ISO
}

// Despesas / custos operacionais
export interface Despesa {
  id: string;
  categoria: string; // Luz, Água, Internet, Aluguel…
  descricao?: string;
  valor: number;
  data: string; // ISO — data do lançamento/competência
  recorrente?: boolean; // despesa mensal fixa
}

export interface NovaDespesa {
  categoria: string;
  descricao?: string;
  valor: number;
  data?: string;
  recorrente?: boolean;
}

// Série temporal para relatórios (evolução mês a mês)
export interface PontoMensal {
  mes: string; // rótulo curto: "jan", "fev"…
  matriculas: number;
  receita: number; // MRR do mês
  cancelamentos: number;
}

// Plano (Estágio 2)
export interface Plano {
  id: string;
  nome: string;
  valorMensal: number;
  duracaoMeses: number;
  ativo?: boolean; // false = arquivado (não oferecido em novas matrículas). undefined = ativo.
  descricao?: string;
}

/** Dados para criar um plano novo pela gestão de planos. */
export interface NovoPlano {
  nome: string;
  valorMensal: number;
  duracaoMeses: number;
  descricao?: string;
}

// Estágio 2/3 — situação do aluno
export type AlunoStatus = "ativo" | "pendente" | "inadimplente" | "cancelado";

export const ALUNO_STATUS_LABEL: Record<AlunoStatus, string> = {
  ativo: "Ativo",
  pendente: "Pagamento pendente",
  inadimplente: "Inadimplente",
  cancelado: "Cancelado",
};

export interface Aluno {
  id: string;
  codigo: string; // código de cadastro, ex.: CD00001
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  planoId: string;
  status: AlunoStatus;
  matriculadoEm: string; // ISO
  vencimentoPlano: string; // ISO — fim do plano contratado
  ultimaPresenca: string; // ISO
  // Opcionais — sugeridos no "complete o cadastro" após a matrícula
  dataNascimento?: string; // ISO
  cep?: string;
  estado?: string;
  cidade?: string;
  rua?: string;
  numero?: string;
}

// Candidato à matrícula (Estágio 2) — lead em aberto ou aluno a renovar
export type CandidatoOrigem = "lead" | "renovacao";

export interface Candidato {
  refId: string; // id do lead ou aluno de origem
  origem: CandidatoOrigem;
  nome: string;
  telefone: string;
  email?: string; // aluno já tem; lead não
  cpf?: string; // idem
  codigo?: string; // código de cadastro da pessoa (CD…)
  planoAtualId?: string; // plano vigente, quando renovação
  detalhe: string; // texto curto de contexto (origem / situação)
}

// Cadastro único de pessoa (fonte da verdade — lead que evolui para aluno)
export interface Endereco {
  cep?: string;
  estado?: string;
  cidade?: string;
  rua?: string;
  numero?: string;
}

export type PessoaFase = "lead" | "aluno";

export interface Pessoa {
  id: string;
  codigo: string; // CD00001 — gerado na criação, vale para toda a vida
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  rg?: string;
  vendedor?: string;
  origem: Origem;
  fase: PessoaFase;
  criadoEm: string; // ISO
  // enquanto lead
  estagio?: LeadEstagio;
  motivoPerdido?: string;
  // enquanto aluno
  planoId?: string;
  status?: AlunoStatus;
  matriculadoEm?: string;
  vencimentoPlano?: string;
  ultimaPresenca?: string;
  // ficha opcional
  dataNascimento?: string;
  endereco?: Endereco;
}

/** Dados mínimos para criar um cadastro (entra como lead novo). */
export interface NovaPessoa {
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  rg?: string;
  vendedor?: string;
  origem: Origem;
  dataNascimento?: string;
  endereco?: Endereco;
}

// Cobranças / Asaas (Estágio 2 e 3)
export type CobrancaStatus = "pendente" | "pago" | "atrasado";
export type CobrancaTipo = "matricula" | "mensalidade" | "renovacao";

export const COBRANCA_STATUS_LABEL: Record<CobrancaStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  atrasado: "Atrasado",
};

export interface Cobranca {
  id: string;
  alunoId: string;
  tipo: CobrancaTipo;
  valor: number;
  vencimento: string; // ISO
  status: CobrancaStatus;
  asaasId: string | null; // null = ainda não sincronizado com Asaas
  assinaturaId?: string; // id da assinatura Asaas (subscription), quando recorrente
  linkPagamento?: string;
}

// Atendimento WhatsApp (Estágio 1) — conversas que chegam pela Evolution API
export type WhatsappStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export type ConversaInteresse =
  | "nao_classificado"
  | "com_interesse"
  | "sem_interesse"
  | "perdido"
  | "convertido";

export const INTERESSE_LABEL: Record<ConversaInteresse, string> = {
  nao_classificado: "Não classificado",
  com_interesse: "Com interesse",
  sem_interesse: "Sem interesse",
  perdido: "Perdido",
  convertido: "Convertido",
};

/**
 * Classificar o atendimento move o lead no funil. "Sem interesse" cai em
 * `qualificado` de propósito: a pessoa conversou e foi qualificada, mas não quer
 * agora — é a lista de reativação. `perdido` é o descarte definitivo, com motivo.
 */
export const INTERESSE_ESTAGIO: Record<ConversaInteresse, LeadEstagio | null> = {
  nao_classificado: null,
  com_interesse: "interesse",
  sem_interesse: "qualificado",
  perdido: "perdido",
  convertido: "convertido",
};

export interface ConversaResumo {
  id: string;
  nome: string; // pushName, nome do cadastro ou telefone formatado
  telefone: string;
  personId: string | null;
  atendente: string | null;
  interesse: ConversaInteresse;
  naoLidas: number;
  ultimaMensagemEm: string; // ISO
  preview: string;
}

export interface MensagemItem {
  id: string;
  direcao: "IN" | "OUT";
  autor: "LEAD" | "ATENDENTE";
  autorNome: string | null; // null em OUT respondido pelo celular do dono
  texto: string;
  tipoMidia: string;
  enviadaEm: string; // ISO
  erro: string | null;
}

export interface AtendimentoItem {
  id: string;
  usuario: string;
  interesse: ConversaInteresse;
  observacao: string | null;
  criadoEm: string; // ISO
}
