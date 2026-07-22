import { NextResponse } from "next/server";
import { criarPlano, listarPlanos } from "@/lib/store";
import type { NovoPlano } from "@/lib/types";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";

export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  return NextResponse.json(await listarPlanos());
}

export async function POST(req: Request) {
  // Ler plano faz parte da matrícula; criar/editar é gestão (tela de Cobrança).
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const body = (await req.json()) as Partial<NovoPlano>;

  if (!body?.nome?.trim()) {
    return NextResponse.json({ erro: "Nome é obrigatório" }, { status: 400 });
  }
  const valorMensal = Number(body.valorMensal);
  if (!Number.isFinite(valorMensal) || valorMensal <= 0) {
    return NextResponse.json({ erro: "Valor mensal inválido" }, { status: 400 });
  }
  const duracaoDias = Number(body.duracaoDias);
  if (!Number.isInteger(duracaoDias) || duracaoDias < 1) {
    return NextResponse.json({ erro: "Duração inválida" }, { status: 400 });
  }

  const plano = await criarPlano({
    nome: body.nome,
    valorMensal,
    duracaoDias,
    descricao: body.descricao,
  });
  return NextResponse.json(plano, { status: 201 });
}
