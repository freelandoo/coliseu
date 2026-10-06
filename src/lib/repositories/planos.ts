import { prisma } from "@/lib/db";
import { toPlano } from "@/lib/repositories/mappers";
import type { NovoPlano, Plano } from "@/lib/types";
import { unitIdAtual } from "@/lib/repositories/unit";

export async function listarPlanosRepo(): Promise<Plano[]> {
  const rows = await prisma.plan.findMany({ orderBy: { valorMensal: "desc" } });
  return rows.map(toPlano);
}

export async function planoPorIdRepo(id: string): Promise<Plano | undefined> {
  const row = await prisma.plan.findUnique({ where: { id } });
  return row ? toPlano(row) : undefined;
}

export async function criarPlanoRepo(input: NovoPlano): Promise<Plano> {
  const row = await prisma.plan.create({
    data: {
      nome: input.nome.trim(),
      valorMensal: input.valorMensal,
      duracaoDias: input.duracaoDias,
      descricao: input.descricao?.trim() || null,
      ativo: true,
      unitId: await unitIdAtual(),
    },
  });
  return toPlano(row);
}

export async function atualizarPlanoRepo(
  id: string,
  patch: Partial<Plano>,
): Promise<Plano | undefined> {
  const exists = await prisma.plan.findUnique({ where: { id } });
  if (!exists) return undefined;
  const row = await prisma.plan.update({
    where: { id },
    data: {
      nome: patch.nome,
      valorMensal: patch.valorMensal,
      duracaoDias: patch.duracaoDias,
      ativo: patch.ativo,
      descricao: patch.descricao,
    },
  });
  return toPlano(row);
}

export class MesclaInvalida extends Error {}

export interface MesclaPlanos {
  /** Planos a juntar (2 ou mais). */
  planoIds: string[];
  /** Plano que sobrevive (um dos selecionados) — fica com os alunos de todos. */
  destinoId: string;
  nome: string;
  valorMensal: number;
  duracaoDias: number;
}

/**
 * Junta vários planos em um: o destino recebe nome/valor/duração novos e
 * herda matrículas, histórico, política de acesso e vendas; os demais ficam
 * arquivados com `mescladoEmId` (registro, e trava para o importador do
 * CloudGym não desfazer). Tudo numa transação: ou junta tudo, ou nada.
 *
 * Assinaturas do Asaas mantêm o valor que já cobram — o valor novo vale para
 * matrícula e renovação.
 */
export async function mesclarPlanosRepo(
  input: MesclaPlanos,
): Promise<{ plano: Plano; matriculasMovidas: number; arquivados: string[] }> {
  const ids = [...new Set(input.planoIds)];
  if (ids.length < 2) throw new MesclaInvalida("Selecione ao menos 2 planos.");
  if (!ids.includes(input.destinoId)) throw new MesclaInvalida("O plano de destino precisa estar entre os selecionados.");
  const nome = input.nome.trim();
  if (!nome) throw new MesclaInvalida("Dê um nome ao plano.");
  if (!Number.isFinite(input.valorMensal) || input.valorMensal <= 0) throw new MesclaInvalida("Valor mensal inválido.");
  if (!Number.isInteger(input.duracaoDias) || input.duracaoDias < 1) throw new MesclaInvalida("Duração inválida.");

  const planos = await prisma.plan.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, mescladoEmId: true } });
  if (planos.length !== ids.length) throw new MesclaInvalida("Plano não encontrado.");
  if (planos.some((p) => p.mescladoEmId)) throw new MesclaInvalida("Um dos planos já foi mesclado em outro.");
  const origens = ids.filter((id) => id !== input.destinoId);

  const r = await prisma.$transaction(async (tx) => {
    const movidas = await tx.membership.updateMany({ where: { planId: { in: origens } }, data: { planId: input.destinoId } });
    await tx.historicoPlano.updateMany({ where: { planId: { in: origens } }, data: { planId: input.destinoId } });
    await tx.accessPolicy.updateMany({ where: { planId: { in: origens } }, data: { planId: input.destinoId } });
    await tx.vendaPlanoDia.updateMany({ where: { planId: { in: origens } }, data: { planId: input.destinoId } });
    // Planos que já tinham sido mesclados num dos de origem seguem para o destino.
    await tx.plan.updateMany({ where: { mescladoEmId: { in: origens } }, data: { mescladoEmId: input.destinoId } });
    for (const p of planos.filter((x) => x.id !== input.destinoId)) {
      await tx.plan.update({
        where: { id: p.id },
        data: { ativo: false, mescladoEmId: input.destinoId, descricao: `Mesclado em "${nome}"` },
      });
    }
    const destino = await tx.plan.update({
      where: { id: input.destinoId },
      data: { nome, valorMensal: input.valorMensal, duracaoDias: input.duracaoDias, ativo: true },
    });
    return { destino, movidas: movidas.count };
  });

  return {
    plano: toPlano(r.destino),
    matriculasMovidas: r.movidas,
    arquivados: planos.filter((p) => p.id !== input.destinoId).map((p) => p.nome),
  };
}
