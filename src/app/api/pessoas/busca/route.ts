import { NextResponse } from "next/server";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { buscarPessoasRepo } from "@/lib/repositories/pessoas";

export const dynamic = "force-dynamic";

/** GET ?q= — busca em todos os cadastros (inclusive leads antigos e ex-alunos). */
export async function GET(req: Request) {
  const g = await exigirModuloApi("matriculados", "captacao");
  if (g.erro) return g.erro;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json(await buscarPessoasRepo(q.slice(0, 80)));
}
