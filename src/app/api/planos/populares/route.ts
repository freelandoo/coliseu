import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listarPlanos } from "@/lib/store";
import { exigirSessaoApi } from "@/lib/auth/api-guard";

/**
 * GET — planos oferecidos (ativos, não mesclados) do mais escolhido para o
 * menos: alunos com matrícula ACTIVE em cada um. Alimenta o select da ficha
 * de matrícula da recepção, onde o plano mais comum já vem escolhido.
 */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const [planos, contagem] = await Promise.all([
    listarPlanos(),
    prisma.membership.groupBy({ by: ["planId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const alunos = new Map(contagem.map((c) => [c.planId, c._count._all]));
  const oferecidos = planos
    .filter((p) => p.ativo !== false && !p.mesclado)
    .map((p) => ({ ...p, alunosAtivos: alunos.get(p.id) ?? 0 }))
    .sort((a, b) => b.alunosAtivos - a.alunosAtivos || a.nome.localeCompare(b.nome, "pt-BR"));
  return NextResponse.json(oferecidos);
}
