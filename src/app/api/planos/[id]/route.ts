import { NextResponse } from "next/server";
import { atualizarPlano } from "@/lib/store";
import type { Plano } from "@/lib/types";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  const body = (await req.json()) as Partial<Plano>;

  const patch: Partial<Plano> = {};
  if (typeof body.nome === "string") {
    if (!body.nome.trim()) {
      return NextResponse.json({ erro: "Nome inválido" }, { status: 400 });
    }
    patch.nome = body.nome.trim();
  }
  if (body.valorMensal !== undefined) {
    const v = Number(body.valorMensal);
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ erro: "Valor mensal inválido" }, { status: 400 });
    }
    patch.valorMensal = v;
  }
  if (body.duracaoDias !== undefined) {
    const d = Number(body.duracaoDias);
    if (!Number.isInteger(d) || d < 1) {
      return NextResponse.json({ erro: "Duração inválida" }, { status: 400 });
    }
    patch.duracaoDias = d;
  }
  if (typeof body.ativo === "boolean") {
    // Plano mesclado não volta: os alunos dele já estão no destino.
    if (body.ativo) {
      const atual = await prisma.plan.findUnique({ where: { id }, select: { mescladoEmId: true } });
      if (atual?.mescladoEmId) {
        return NextResponse.json({ erro: "Este plano foi mesclado em outro e não pode ser reativado." }, { status: 409 });
      }
    }
    patch.ativo = body.ativo;
  }
  if (typeof body.descricao === "string") {
    patch.descricao = body.descricao.trim() || undefined;
  }

  const plano = await atualizarPlano(id, patch);
  if (!plano) {
    return NextResponse.json({ erro: "Plano não encontrado" }, { status: 404 });
  }
  return NextResponse.json(plano);
}
