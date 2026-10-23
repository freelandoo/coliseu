import { prisma } from "@/lib/db";
import { toPlano } from "@/lib/repositories/mappers";
import type { NovoPlano, Plano } from "@/lib/types";
import { unitIdAtual } from "@/lib/repositories/unit";

export async function listarPlanosRepo(): Promise<Plano[]> {
  // excluído na tela de Planos some de toda lista (a linha só fica pelo histórico)
  const rows = await prisma.plan.findMany({ where: { excluidoEm: null }, orderBy: { valorMensal: "desc" } });
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

/** Matrícula nesses status = o plano ainda tem aluno e não pode ser excluído. */
const STATUS_COM_ALUNO = ["DRAFT", "PENDING_PAYMENT", "ACTIVE", "SUSPENDED"] as const;

export interface ResultadoExclusao {
  /** apagado = sumiu do banco; escondido = tinha matrícula antiga, só saiu das listas */
  excluidos: { id: string; nome: string; modo: "apagado" | "escondido" }[];
  recusados: { id: string; nome: string; motivo: string }[];
}

/**
 * Exclui planos sem aluno (tela Planos → Excluir). Plano com matrícula em
 * andamento é recusado — mescle antes. Sem nenhuma referência, a linha é
 * apagada; com histórico (matrículas encerradas, vendas, mesclados, política
 * de acesso), ela fica arquivada com `excluidoEm` e some das listas, para o
 * histórico e os relatórios não quebrarem.
 */
export async function excluirPlanosRepo(planoIds: string[]): Promise<ResultadoExclusao> {
  const ids = [...new Set(planoIds)];
  const planos = await prisma.plan.findMany({
    where: { id: { in: ids }, excluidoEm: null },
    select: {
      id: true, nome: true,
      _count: { select: { memberships: true, historicos: true, accessPolicies: true, mesclados: true } },
    },
  });
  const comAluno = await prisma.membership.groupBy({
    by: ["planId"],
    where: { planId: { in: ids }, status: { in: [...STATUS_COM_ALUNO] } },
    _count: { _all: true },
  });
  const alunosPorPlano = new Map(comAluno.map((c) => [c.planId, c._count._all]));
  // vendas guardam planId sem chave estrangeira: contam como histórico também
  const vendas = await prisma.vendaPlanoDia.groupBy({ by: ["planId"], where: { planId: { in: ids } }, _count: { _all: true } });
  const vendasPorPlano = new Map(vendas.map((v) => [v.planId, v._count._all]));

  const r: ResultadoExclusao = { excluidos: [], recusados: [] };
  for (const p of planos) {
    const alunos = alunosPorPlano.get(p.id) ?? 0;
    if (alunos > 0) {
      r.recusados.push({ id: p.id, nome: p.nome, motivo: `tem ${alunos} aluno(s) — mescle com outro plano antes` });
      continue;
    }
    const c = p._count;
    if (c.memberships + c.historicos + c.accessPolicies + c.mesclados + (vendasPorPlano.get(p.id) ?? 0) === 0) {
      await prisma.plan.delete({ where: { id: p.id } });
      r.excluidos.push({ id: p.id, nome: p.nome, modo: "apagado" });
    } else {
      await prisma.plan.update({ where: { id: p.id }, data: { excluidoEm: new Date(), ativo: false } });
      r.excluidos.push({ id: p.id, nome: p.nome, modo: "escondido" });
    }
  }
  return r;
}
