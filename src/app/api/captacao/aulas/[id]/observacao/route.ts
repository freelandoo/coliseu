import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { salvarObservacaoAulaRepo } from "@/lib/repositories/aulas-experimentais";
import { normalizarObservacao, OBSERVACAO_MAX } from "@/lib/aula-experimental";

export const dynamic = "force-dynamic";

/**
 * PATCH — a observação que a recepção escreve no calendário da Captação.
 *
 * Nada sai para o WhatsApp: é recado interno, do turno para o turno seguinte.
 * Quem atende escreve e quem abre a agenda do dia lê.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { observacao?: unknown };

  const obs = normalizarObservacao(body.observacao);
  if (!obs.ok) {
    return NextResponse.json(
      { erro: `A observação precisa ser um texto de até ${OBSERVACAO_MAX} caracteres.` },
      { status: 400 },
    );
  }

  const aula = await salvarObservacaoAulaRepo(id, obs.valor);
  if (!aula) return NextResponse.json({ erro: "aula não encontrada" }, { status: 404 });

  return NextResponse.json({ aula });
}
