import { prisma } from "@/lib/db";
import { unitIdAtual } from "@/lib/repositories/unit";
import { chaveTelefone, formatarTelefone } from "@/lib/whatsapp/telefone";
import type { AulaExperimentalItem } from "@/lib/types";

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
};

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
