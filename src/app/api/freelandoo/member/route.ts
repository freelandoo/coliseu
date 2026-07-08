import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { memberByCpf } from "@/lib/freelandoo/provider";

export async function GET(req: Request) {
  const erro = await exigirFreelandoo(req);
  if (erro) return erro;
  const cpf = new URL(req.url).searchParams.get("cpf");
  if (!cpf) return NextResponse.json({ error: "cpf obrigatório" }, { status: 400 });
  return NextResponse.json(await memberByCpf(cpf));
}
