import { prisma } from "@/lib/db";
import { toPlano } from "@/lib/repositories/mappers";
import type { NovoPlano, Plano } from "@/lib/types";

const UNIT_SLUG = "coliseu-team";

async function unitId(): Promise<string> {
  const u = await prisma.unit.findUniqueOrThrow({ where: { slug: UNIT_SLUG } });
  return u.id;
}

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
      duracaoMeses: input.duracaoMeses,
      descricao: input.descricao?.trim() || null,
      ativo: true,
      unitId: await unitId(),
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
      duracaoMeses: patch.duracaoMeses,
      ativo: patch.ativo,
      descricao: patch.descricao,
    },
  });
  return toPlano(row);
}
