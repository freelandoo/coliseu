import { NextResponse } from "next/server";
import { criarDespesa, listarDespesas } from "@/lib/store";
import type { NovaDespesa } from "@/lib/types";

export async function GET() {
  return NextResponse.json(await listarDespesas());
}

export async function POST(req: Request) {
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
