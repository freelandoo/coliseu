import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { marcarPresencaRepo } from "@/lib/repositories/aulas-experimentais";

export const dynamic = "force-dynamic";

/**
 * PATCH — veio / faltou, marcado depois do horário (aba Histórico).
 *
 * Decide a regra de uma aula por pessoa: aula passada sem marcação conta como
 * feita; "faltou" libera agendar de novo. `null` desfaz a marcação.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { presenca?: unknown };
  const p = body.presenca;
  if (p !== "veio" && p !== "faltou" && p !== null) {
    return NextResponse.json({ erro: "presença deve ser veio, faltou ou null" }, { status: 400 });
  }
  const aula = await marcarPresencaRepo(id, p);
  if (!aula) return NextResponse.json({ erro: "aula não encontrada" }, { status: 404 });
  return NextResponse.json({ aula });
}
