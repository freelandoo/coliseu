import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { simularFaceCheck } from "@/lib/access/simulate";

/** Simulador de face check (teste): avalia a política e registra o giro ALLOWED/DENIED. */
export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;

  const body = (await req.json()) as { personId?: string };
  if (!body.personId) {
    return NextResponse.json({ erro: "personId obrigatório" }, { status: 400 });
  }

  try {
    const resultado = await simularFaceCheck(body.personId);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao simular acesso" },
      { status: 400 },
    );
  }
}
