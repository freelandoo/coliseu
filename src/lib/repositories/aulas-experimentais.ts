import { prisma } from "@/lib/db";
import { unitIdAtual } from "@/lib/repositories/unit";
import { chaveTelefone, formatarTelefone } from "@/lib/whatsapp/telefone";
import type { AulaExperimentalItem, AulaLegadoItem } from "@/lib/types";
import { primeiroNomeChave, situacaoAnterior, type SituacaoAnterior } from "@/lib/aula-experimental";

type Linha = {
  id: string;
  nome: string;
  telefone: string;
  modalidade: string;
  data: string;
  hora: number;
  conversaId: string | null;
  personId: string | null;
  agendadoPor: { nome: string } | null;
  observacao: string | null;
  criadoEm: Date;
  cpf: string | null;
  presenca: string | null;
  lembreteEnviadoEm: Date | null;
};

const presencaDe = (v: string | null): "veio" | "faltou" | null => (v === "veio" || v === "faltou" ? v : null);

function toItem(a: Linha): AulaExperimentalItem {
  return {
    id: a.id,
    nome: a.nome,
    telefone: formatarTelefone(a.telefone),
    modalidade: a.modalidade,
    data: a.data,
    hora: a.hora,
    conversaId: a.conversaId,
    personId: a.personId,
    agendadoPor: a.agendadoPor?.nome ?? null,
    observacao: a.observacao,
    criadoEm: a.criadoEm.toISOString(),
    cpf: a.cpf,
    presenca: presencaDe(a.presenca),
    lembreteEnviadoEm: a.lembreteEnviadoEm?.toISOString() ?? null,
  };
}

const SELECT = {
  id: true,
  nome: true,
  telefone: true,
  modalidade: true,
  data: true,
  hora: true,
  conversaId: true,
  personId: true,
  observacao: true,
  criadoEm: true,
  cpf: true,
  presenca: true,
  lembreteEnviadoEm: true,
  agendadoPor: { select: { nome: true } },
} as const;

/**
 * Da mais próxima para a mais distante: a recepção lê a lista para saber quem
 * chega, e o passado só interessa como consulta.
 */
export async function listarAulasExperimentaisRepo(): Promise<AulaExperimentalItem[]> {
  const aulas = await prisma.aulaExperimental.findMany({
    orderBy: [{ data: "asc" }, { hora: "asc" }],
    select: SELECT,
  });
  return aulas.map(toItem);
}

/**
 * Só os dias de `de` a `ate` (inclusive), para resumos que não precisam do
 * histórico inteiro. `data` é "AAAA-MM-DD": a ordem do texto é a do calendário.
 */
export async function listarAulasExperimentaisEntreRepo(
  de: string,
  ate: string,
): Promise<AulaExperimentalItem[]> {
  const aulas = await prisma.aulaExperimental.findMany({
    where: { data: { gte: de, lte: ate } },
    orderBy: [{ data: "asc" }, { hora: "asc" }],
    select: SELECT,
  });
  return aulas.map(toItem);
}

/**
 * Grava o compromisso. Cada agendamento é uma linha nova — remarcar não apaga
 * o anterior, e a lista mostra a conversa inteira de tentativas.
 */
export async function criarAulaExperimentalRepo(input: {
  /** Nula quando a aula foi marcada na própria tela de Aula experimental. */
  conversaId: string | null;
  personId: string | null;
  nome: string;
  telefone: string;
  modalidade: string;
  data: string;
  hora: number;
  agendadoPorId: string;
  observacao?: string | null;
  /** Só dígitos. */
  cpf?: string | null;
}): Promise<AulaExperimentalItem> {
  const aula = await prisma.aulaExperimental.create({
    data: {
      unitId: await unitIdAtual(),
      conversaId: input.conversaId,
      personId: input.personId,
      nome: input.nome,
      telefone: input.telefone,
      modalidade: input.modalidade,
      data: input.data,
      hora: input.hora,
      agendadoPorId: input.agendadoPorId,
      observacao: input.observacao ?? null,
      cpf: input.cpf ?? null,
    },
    select: SELECT,
  });
  return toItem(aula);
}

/**
 * Quem já existe com este telefone (casamento pelos 8 últimos dígitos, o mesmo
 * do Atendimento): o cadastro mais recente e a conversa dele. Serve para a aula
 * marcada no balcão aparecer ligada à pessoa e à conversa, sem duplicar lead.
 */
export async function acharPorTelefoneRepo(
  telefone: string,
): Promise<{ personId: string | null; nome: string | null; fase: string | null; conversaId: string | null }> {
  const chave = chaveTelefone(telefone);
  if (!chave) return { personId: null, nome: null, fase: null, conversaId: null };
  const [pessoa] = await prisma.$queryRaw<{ id: string; nome: string; fase: string }[]>`
    SELECT id, nome, fase::text AS fase FROM "Person"
    WHERE right(regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g'), 8) = ${chave}
    ORDER BY (fase = 'exaluno'), "criadoEm" DESC
    LIMIT 1`;
  const conversas = await prisma.$queryRaw<{ id: string; personId: string | null }[]>`
    SELECT id, "personId" FROM "Conversa"
    WHERE "ehGrupo" = false AND right(telefone, 8) = ${chave}
    ORDER BY "ultimaMensagemEm" DESC
    LIMIT 5`;
  // A conversa já ligada a essa pessoa vence; senão, a mais recente.
  const conversa = conversas.find((c) => pessoa && c.personId === pessoa.id) ?? conversas[0];
  return { personId: pessoa?.id ?? null, nome: pessoa?.nome ?? null, fase: pessoa?.fase ?? null, conversaId: conversa?.id ?? null };
}

/**
 * Reescreve a observação da aula. Só esse campo se mexe: data, hora e
 * modalidade são o que foi combinado com a pessoa por mensagem, e mudar isso
 * pela agenda deixaria a lista dizendo uma coisa e o WhatsApp dela outra —
 * remarcar continua sendo agendar de novo pela conversa.
 *
 * `null` quando a aula não existe mais (alguém apagou entre abrir a tela e
 * salvar), para a rota responder 404 em vez de estourar.
 */
export async function salvarObservacaoAulaRepo(
  id: string,
  observacao: string | null,
): Promise<AulaExperimentalItem | null> {
  const existe = await prisma.aulaExperimental.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return null;

  const aula = await prisma.aulaExperimental.update({
    where: { id },
    data: { observacao },
    select: SELECT,
  });
  return toItem(aula);
}

export interface AulaAnterior {
  origem: "sistema" | "planilha";
  nome: string;
  data: string | null;
  hora: number | null;
  modalidade: string | null;
  situacao: SituacaoAnterior;
  /** Como casou: CPF igual, ou telefone + primeiro nome. */
  porque: "cpf" | "telefone";
}

/**
 * Aulas anteriores da mesma pessoa, no sistema e na planilha antiga. Casa por
 * CPF (só o sistema tem) ou por telefone (8 últimos dígitos) + primeiro nome.
 * `ignorarId`: a própria aula, quando se confere uma que já existe.
 */
export async function aulasAnterioresRepo(
  q: { cpf?: string | null; telefone?: string | null; nome?: string | null },
  hoje: string,
): Promise<AulaAnterior[]> {
  const cpf = (q.cpf ?? "").replace(/\D/g, "");
  const chave = chaveTelefone(q.telefone);
  const nomeChave = primeiroNomeChave(q.nome ?? "");
  const porTelefone = Boolean(chave && nomeChave);
  if (cpf.length !== 11 && !porTelefone) return [];

  const [sistema, planilha] = await Promise.all([
    prisma.aulaExperimental.findMany({
      where: {
        OR: [
          ...(cpf.length === 11 ? [{ cpf }] : []),
          ...(porTelefone ? [{ telefone: { endsWith: chave } }] : []),
        ],
      },
      select: { nome: true, data: true, hora: true, modalidade: true, presenca: true, cpf: true, telefone: true },
      orderBy: [{ data: "desc" }, { hora: "desc" }],
    }),
    porTelefone
      ? prisma.aulaExperimentalLegado.findMany({
          where: { telefone: { endsWith: chave } },
          select: { nome: true, dataAula: true, hora: true, modalidade: true, presenca: true },
          orderBy: { dataAula: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const out: AulaAnterior[] = [];
  for (const a of sistema) {
    const pelCpf = cpf.length === 11 && a.cpf === cpf;
    // Telefone igual com outro primeiro nome é outra pessoa (mãe e filho).
    if (!pelCpf && primeiroNomeChave(a.nome) !== nomeChave) continue;
    const situacao = situacaoAnterior({ data: a.data, presenca: a.presenca }, hoje);
    if (situacao) {
      out.push({ origem: "sistema", nome: a.nome, data: a.data, hora: a.hora, modalidade: a.modalidade, situacao, porque: pelCpf ? "cpf" : "telefone" });
    }
  }
  for (const a of planilha) {
    if (primeiroNomeChave(a.nome) !== nomeChave) continue;
    const situacao = situacaoAnterior({ data: a.dataAula, presenca: a.presenca }, hoje);
    if (situacao) {
      out.push({ origem: "planilha", nome: a.nome, data: a.dataAula, hora: a.hora, modalidade: a.modalidade, situacao, porque: "telefone" });
    }
  }
  return out;
}

/** Dias de aula experimental por pessoa (pedido de 27/10/2026; antes era 1). */
export const LIMITE_DIAS_AULA = 3;

/**
 * Dias de aula que a pessoa já usou: os que fez e os que tem marcados (falta
 * não conta). Duas aulas no mesmo dia contam como um dia. A mais recente
 * primeiro.
 */
export function diasUsados(anteriores: AulaAnterior[]): AulaAnterior[] {
  const vistos = new Set<string>();
  const out: AulaAnterior[] = [];
  for (const a of anteriores) {
    if (a.situacao === "faltou") continue;
    const dia = a.data ?? `sem-data-${out.length}`;
    if (vistos.has(dia)) continue;
    vistos.add(dia);
    out.push(a);
  }
  return out;
}

/** A pessoa já usou os dias de aula experimental (e por isso não pode marcar outra)? */
export function esgotouAulas(anteriores: AulaAnterior[]): AulaAnterior[] | null {
  const usados = diasUsados(anteriores);
  return usados.length >= LIMITE_DIAS_AULA ? usados : null;
}

/** Veio / faltou, marcado pela recepção depois do horário. `null` desfaz. */
export async function marcarPresencaRepo(
  id: string,
  presenca: "veio" | "faltou" | null,
): Promise<AulaExperimentalItem | null> {
  const existe = await prisma.aulaExperimental.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return null;
  return toItem(await prisma.aulaExperimental.update({ where: { id }, data: { presenca }, select: SELECT }));
}

/** Planilha antiga inteira, da aula (ou visita) mais recente para a mais antiga. */
export async function listarLegadoRepo(): Promise<AulaLegadoItem[]> {
  const linhas = await prisma.aulaExperimentalLegado.findMany({
    orderBy: [{ dataAula: { sort: "desc", nulls: "last" } }, { dataVisita: { sort: "desc", nulls: "last" } }],
  });
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    telefone: formatarTelefone(l.telefone),
    modalidade: l.modalidade,
    dataVisita: l.dataVisita,
    dataAula: l.dataAula,
    hora: l.hora,
    presenca: presencaDe(l.presenca),
    statusOriginal: l.statusOriginal,
    atendente: l.atendente,
    comoConheceu: l.comoConheceu,
    andamento: l.andamento,
  }));
}

/** Cadastro com este CPF (comparando só dígitos — o cadastro pode ter pontuação). */
export async function pessoaPorCpfRepo(cpf: string): Promise<{ id: string; nome: string; fase: string } | null> {
  const [p] = await prisma.$queryRaw<{ id: string; nome: string; fase: string }[]>`
    SELECT id, nome, fase::text AS fase FROM "Person"
    WHERE regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = ${cpf}
    ORDER BY (fase = 'exaluno'), "criadoEm" DESC
    LIMIT 1`;
  return p ?? null;
}

/** Cadastro sem CPF ganha o informado na aula (nunca sobrescreve um CPF que já existe). */
export async function guardarCpfNaPessoaRepo(personId: string, cpf: string): Promise<void> {
  await prisma.person.updateMany({
    where: { id: personId, OR: [{ cpf: null }, { cpf: "" }] },
    data: { cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` },
  });
}
