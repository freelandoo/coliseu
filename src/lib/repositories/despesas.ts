import { prisma } from "@/lib/db";
import { toDespesa } from "@/lib/repositories/mappers";
import type { Despesa, NovaDespesa } from "@/lib/types";

export async function listarDespesasRepo(): Promise<Despesa[]> {
  const rows = await prisma.despesa.findMany({ orderBy: { data: "desc" } });
  return rows.map(toDespesa);
}

export async function criarDespesaRepo(input: NovaDespesa): Promise<Despesa> {
  const row = await prisma.despesa.create({
    data: {
      categoria: input.categoria.trim(),
      descricao: input.descricao?.trim() || null,
      valor: input.valor,
      data: input.data ? new Date(input.data) : new Date(),
      recorrente: input.recorrente ?? false,
    },
  });
  return toDespesa(row);
}

export async function removerDespesaRepo(id: string): Promise<boolean> {
  const exists = await prisma.despesa.findUnique({ where: { id } });
  if (!exists) return false;
  await prisma.despesa.delete({ where: { id } });
  return true;
}

export async function totalDespesasRepo(): Promise<number> {
  const rows = await prisma.despesa.findMany({ select: { valor: true } });
  return rows.reduce((s, d) => s + d.valor, 0);
}
