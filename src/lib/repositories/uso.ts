import { prisma } from "@/lib/db";
import {
  ONLINE_MS,
  SLOT_MS,
  estimarTempoAtivo,
  intervaloPeriodo,
  type Periodo,
} from "@/lib/uso";
import type { ConversaInteresse } from "@/lib/types";
import type { Role } from "@prisma/client";

/** Uma linha do quadro de uso — tudo que um colaborador fez no período. */
export interface UsoColaborador {
  id: string;
  nome: string;
  login: string;
  role: Role;
  ativo: boolean;

  /** Respostas enviadas pelo sistema. O que sai do celular do dono não tem autor e não entra. */
  mensagens: number;
  /** Conversas distintas em que essa pessoa respondeu ao menos uma vez. */
  conversas: number;
  /** Classificações de lead gravadas (o "com interesse", "perdido"… da conversa). */
  classificacoes: number;
  /** As mesmas classificações abertas por bandeira — é o que diz o que ela classificou. */
  porInteresse: Record<ConversaInteresse, number>;
  aulas: number;
  matriculas: number;

  /** Medido: soma dos blocos de presença. Zero também significa "antes da medição". */
  msEmTela: number;
  /** Estimado das ações do período — ver `estimarTempoAtivo`. */
  msAtivo: number;

  /** Última ação ou batida de ponto, o que for mais recente. */
  ultimaAtividadeEm: string | null;
  /** Começo da sessão mais recente — o "entrou às". Não é recorte do período. */
  ultimoLoginEm: string | null;
  online: boolean;
}

export interface UsoAtendimento {
  periodo: Periodo;
  inicio: string;
  fim: string;
  colaboradores: UsoColaborador[];
  /**
   * Primeira batida de ponto que existe no banco. Antes dela não havia medição:
   * a tela usa isso para dizer "sem medição neste período" em vez de "0min", que
   * seria uma acusação de que ninguém trabalhou.
   */
  presencaDesde: string | null;
}

const INTERESSE_ZERO: Record<ConversaInteresse, number> = {
  nao_classificado: 0,
  com_interesse: 0,
  sem_interesse: 0,
  perdido: 0,
  convertido: 0,
};

/** Acumulador por usuário enquanto os cinco conjuntos de linhas são cruzados. */
interface Balde {
  mensagens: number;
  conversas: Set<string>;
  classificacoes: number;
  porInteresse: Record<ConversaInteresse, number>;
  aulas: number;
  matriculas: number;
  /** Marcas de hora de tudo que a pessoa fez — matéria-prima da estimativa. */
  instantes: number[];
}

function baldeVazio(): Balde {
  return {
    mensagens: 0,
    conversas: new Set(),
    classificacoes: 0,
    porInteresse: { ...INTERESSE_ZERO },
    aulas: 0,
    matriculas: 0,
    instantes: [],
  };
}

/**
 * Os indicadores de uso do período, um por colaborador.
 *
 * Tudo sai de registro que já existia — mensagem enviada, classificação de
 * lead, aula marcada, matrícula fechada — mais a presença medida. Nada aqui é
 * inferido de conversa lida: ler não deixa rastro, de propósito.
 *
 * As consultas trazem as linhas cruas em vez de `groupBy` porque a estimativa
 * de tempo precisa das marcas de hora, não do total, e "conversas distintas"
 * precisa dos ids. O volume é o de uma recepção — alguns milhares de linhas no
 * mês mais movimentado.
 */
export async function indicadoresUsoRepo(
  periodo: Periodo,
  agora: Date = new Date(),
): Promise<UsoAtendimento> {
  const { inicio, fim } = intervaloPeriodo(periodo, agora);
  const janela = { gte: inicio, lte: fim };

  const [usuarios, mensagens, registros, aulas, matriculas, presencas, sessoes, primeiraBatida] =
    await Promise.all([
      prisma.user.findMany({
        select: { id: true, nome: true, login: true, role: true, ativo: true },
        orderBy: { nome: "asc" },
      }),
      prisma.mensagem.findMany({
        where: { direcao: "OUT", autorUserId: { not: null }, enviadaEm: janela },
        select: { autorUserId: true, conversaId: true, enviadaEm: true },
      }),
      prisma.atendimentoRegistro.findMany({
        where: { criadoEm: janela },
        select: { userId: true, interesse: true, criadoEm: true },
      }),
      prisma.aulaExperimental.findMany({
        where: { criadoEm: janela, agendadoPorId: { not: null } },
        select: { agendadoPorId: true, criadoEm: true },
      }),
      prisma.membership.findMany({
        where: { matriculadoEm: janela, matriculadoPorId: { not: null } },
        select: { matriculadoPorId: true, matriculadoEm: true },
      }),
      prisma.presencaSlot.groupBy({
        by: ["userId"],
        where: { slot: janela },
        _count: { _all: true },
        _max: { slot: true },
      }),
      prisma.session.groupBy({ by: ["userId"], _max: { createdAt: true } }),
      prisma.presencaSlot.aggregate({ _min: { slot: true } }),
    ]);

  const baldes = new Map<string, Balde>();
  const balde = (id: string) => {
    const atual = baldes.get(id) ?? baldeVazio();
    baldes.set(id, atual);
    return atual;
  };

  for (const m of mensagens) {
    if (!m.autorUserId) continue;
    const b = balde(m.autorUserId);
    b.mensagens++;
    b.conversas.add(m.conversaId);
    b.instantes.push(m.enviadaEm.getTime());
  }
  for (const r of registros) {
    const b = balde(r.userId);
    b.classificacoes++;
    b.porInteresse[r.interesse as ConversaInteresse]++;
    b.instantes.push(r.criadoEm.getTime());
  }
  for (const a of aulas) {
    if (!a.agendadoPorId) continue;
    const b = balde(a.agendadoPorId);
    b.aulas++;
    b.instantes.push(a.criadoEm.getTime());
  }
  for (const m of matriculas) {
    if (!m.matriculadoPorId) continue;
    const b = balde(m.matriculadoPorId);
    b.matriculas++;
    b.instantes.push(m.matriculadoEm.getTime());
  }

  const presencaPorUsuario = new Map(presencas.map((p) => [p.userId, p]));
  const loginPorUsuario = new Map(sessoes.map((s) => [s.userId, s._max.createdAt]));

  const linhas = usuarios.map((u): UsoColaborador => {
    const b = baldes.get(u.id) ?? baldeVazio();
    const presenca = presencaPorUsuario.get(u.id);
    const ultimoBloco = presenca?._max.slot ?? null;

    // O bloco marca o *começo* de cinco minutos; quem bateu ponto às 14h03 está
    // presente até as 14h05 — sem somar o bloco, a bolinha apagaria cedo demais.
    const fimDaPresenca = ultimoBloco ? ultimoBloco.getTime() + SLOT_MS : null;
    const ultimaAcao = b.instantes.length > 0 ? Math.max(...b.instantes) : null;
    const ultimaAtividade = Math.max(fimDaPresenca ?? 0, ultimaAcao ?? 0);

    return {
      id: u.id,
      nome: u.nome,
      login: u.login,
      role: u.role,
      ativo: u.ativo,
      mensagens: b.mensagens,
      conversas: b.conversas.size,
      classificacoes: b.classificacoes,
      porInteresse: b.porInteresse,
      aulas: b.aulas,
      matriculas: b.matriculas,
      msEmTela: (presenca?._count._all ?? 0) * SLOT_MS,
      msAtivo: estimarTempoAtivo(b.instantes),
      ultimaAtividadeEm: ultimaAtividade > 0 ? new Date(ultimaAtividade).toISOString() : null,
      ultimoLoginEm: loginPorUsuario.get(u.id)?.toISOString() ?? null,
      online: fimDaPresenca !== null && agora.getTime() - fimDaPresenca < ONLINE_MS,
    };
  });

  return {
    periodo,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    // Conta desativada só aparece se trabalhou no período: sem isso, cada
    // colaborador que saiu deixaria para sempre uma linha de zeros na tela.
    colaboradores: linhas
      .filter((l) => l.ativo || temAtividade(l))
      .sort(porRelevancia),
    presencaDesde: primeiraBatida._min.slot?.toISOString() ?? null,
  };
}

function temAtividade(l: UsoColaborador): boolean {
  return (
    l.mensagens > 0 ||
    l.classificacoes > 0 ||
    l.aulas > 0 ||
    l.matriculas > 0 ||
    l.msEmTela > 0
  );
}

/**
 * Quem mais trabalhou primeiro, e quem não trabalhou no fim — mas sempre
 * mostrando todo mundo: o zero de quem passou o período inteiro sem atender é
 * exatamente o que a tela existe para revelar.
 */
function porRelevancia(a: UsoColaborador, b: UsoColaborador): number {
  const peso = (l: UsoColaborador) => l.mensagens + l.classificacoes + l.aulas + l.matriculas;
  return peso(b) - peso(a) || b.msEmTela - a.msEmTela || a.nome.localeCompare(b.nome, "pt-BR");
}
