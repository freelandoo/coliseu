import { NextResponse } from "next/server";
import { criarPlano, listarPlanos } from "@/lib/store";
import type { NovoPlano } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await listarPlanos());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<NovoPlano>;

  if (!body?.nome?.trim()) {
    return NextResponse.json({ erro: "Nome é obrigatório" }, { status: 400 });
  }
  const valorMensal = Number(body.valorMensal);
  if (!Number.isFinite(valorMensal) || valorMensal <= 0) {
    return NextResponse.json({ erro: "Valor mensal inválido" }, { status: 400 });
  }
  const duracaoMeses = Number(body.duracaoMeses);
  if (!Number.isInteger(duracaoMeses) || duracaoMeses < 1) {
    return NextResponse.json({ erro: "Duração inválida" }, { status: 400 });
  }

  const plano = await criarPlano({
    nome: body.nome,
    valorMensal,
    duracaoMeses,
    descricao: body.descricao,
  });
  return NextResponse.json(plano, { status: 201 });
}
