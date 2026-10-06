import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podeModulo, type Papel } from "@/lib/auth/rbac";
import { listarLiberacoes } from "@/lib/access/liberacoes";

/** Histórico das liberações manuais da catraca (quem, motivo, se passou). */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro!;
  if (!podeModulo(g.user.role as Papel, "acesso")) {
    return NextResponse.json({ erro: "sem acesso à catraca" }, { status: 403 });
  }
  return NextResponse.json({ liberacoes: await listarLiberacoes() });
}
