import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { removerRespostaProntaRepo } from "@/lib/repositories/respostas";

export const dynamic = "force-dynamic";

/**
 * DELETE — tira a resposta do acervo comum. Aberto a quem atende (não só
 * ADMIN): não é trilha de auditoria, é texto de trabalho — quem colou errado
 * corrige na hora.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const removida = await removerRespostaProntaRepo(id);
  if (!removida) return NextResponse.json({ erro: "resposta não encontrada" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
