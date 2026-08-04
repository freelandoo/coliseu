import { prisma } from "@/lib/db";
import { unitIdAtual } from "@/lib/repositories/unit";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
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
 * Grava o compromisso. Cada agendamento é uma linha nova — remarcar não apaga
 * o anterior, e a lista mostra a conversa inteira de tentativas.
 */
export async function criarAulaExperimentalRepo(input: {
  conversaId: string;
  personId: string | null;
  nome: string;
  telefone: string;
  modalidade: string;
  data: string;
  hora: number;
  agendadoPorId: string;
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
    },
    select: SELECT,
  });
  return toItem(aula);
}
