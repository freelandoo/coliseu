import { NextResponse } from "next/server";
import { criarPessoa, listarPessoas } from "@/lib/store";
import type { NovaPessoa } from "@/lib/types";
import { exigirSessaoApi } from "@/lib/auth/api-guard";

export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  return NextResponse.json(await listarPessoas());
}

export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const body = (await req.json()) as Partial<NovaPessoa>;

  if (!body?.nome?.trim()) {
    return NextResponse.json({ erro: "Nome é obrigatório" }, { status: 400 });
  }
  if (!body.origem) {
    return NextResponse.json({ erro: "Origem é obrigatória" }, { status: 400 });
  }
  if (!body.telefone?.trim() && !body.email?.trim()) {
    return NextResponse.json(
      { erro: "Informe ao menos telefone ou e-mail" },
      { status: 400 },
    );
  }

  const pessoa = await criarPessoa(body as NovaPessoa);
  return NextResponse.json(pessoa, { status: 201 });
}
