import { NextResponse } from "next/server";
import { atualizarPlano } from "@/lib/store";
import type { Plano } from "@/lib/types";
import { exigirSessaoApi } from "@/lib/auth/api-guard";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
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
  if (body.duracaoMeses !== undefined) {
    const d = Number(body.duracaoMeses);
    if (!Number.isInteger(d) || d < 1) {
      return NextResponse.json({ erro: "Duração inválida" }, { status: 400 });
    }
    patch.duracaoMeses = d;
  }
  if (typeof body.ativo === "boolean") patch.ativo = body.ativo;
  if (typeof body.descricao === "string") {
    patch.descricao = body.descricao.trim() || undefined;
  }

  const plano = await atualizarPlano(id, patch);
  if (!plano) {
    return NextResponse.json({ erro: "Plano não encontrado" }, { status: 404 });
  }
  return NextResponse.json(plano);
}
