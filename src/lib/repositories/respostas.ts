import { prisma } from "@/lib/db";
import type { RespostaProntaItem } from "@/lib/types";

/**
 * Respostas prontas do atendimento. O acervo é comum: qualquer atendente
 * cadastra e todos usam — não existe resposta "minha", existe a da academia.
 */

/** Teto de sanidade para o texto — cabe um roteiro inteiro, não um anexo colado. */
export const RESPOSTA_MAX_CHARS = 4000;

function toItem(r: {
  id: string;
  texto: string;
  criadoEm: Date;
  criadoPor: { nome: string } | null;
}): RespostaProntaItem {
  return {
    id: r.id,
    texto: r.texto,
    autor: r.criadoPor?.nome ?? null,
    criadoEm: r.criadoEm.toISOString(),
  };
}

const INCLUDE_AUTOR = { criadoPor: { select: { nome: true } } } as const;

/** Mais recente primeiro: o que acabou de ser cadastrado é o que se quer usar. */
export async function listarRespostasProntasRepo(): Promise<RespostaProntaItem[]> {
  const rows = await prisma.respostaPronta.findMany({
    include: INCLUDE_AUTOR,
    orderBy: { criadoEm: "desc" },
    take: 200,
  });
  return rows.map(toItem);
}

export async function criarRespostaProntaRepo(
  texto: string,
  userId: string,
): Promise<RespostaProntaItem> {
  const r = await prisma.respostaPronta.create({
    data: { texto, criadoPorId: userId },
    include: INCLUDE_AUTOR,
  });
  return toItem(r);
}

export async function removerRespostaProntaRepo(id: string): Promise<boolean> {
  try {
    await prisma.respostaPronta.delete({ where: { id } });
    return true;
  } catch {
    return false; // já removida
  }
}
