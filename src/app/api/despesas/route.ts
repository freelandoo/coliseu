import { NextResponse } from "next/server";
import { criarDespesa, listarDespesas } from "@/lib/store";
import type { NovaDespesa } from "@/lib/types";
// Custos (despesas e lucro) é módulo do admin — colaborador não lê nem lança.
import { exigirAdminApi } from "@/lib/auth/api-guard";

export async function GET() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  return NextResponse.json(await listarDespesas());
}

export async function POST(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const body = (await req.json()) as Partial<NovaDespesa>;

  if (!body?.categoria?.trim()) {
    return NextResponse.json({ erro: "Categoria é obrigatória" }, { status: 400 });
  }
  const valor = Number(body.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ erro: "Valor inválido" }, { status: 400 });
  }

  const despesa = await criarDespesa({ ...body, categoria: body.categoria, valor });
  return NextResponse.json(despesa, { status: 201 });
}
