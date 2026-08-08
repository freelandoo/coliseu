import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { registrarPresencaRepo } from "@/lib/repositories/presenca";

export const dynamic = "force-dynamic";

/**
 * POST — batida de ponto do navegador de quem está logado. Não recebe corpo
 * nem aceita um instante de fora: quem diz a hora é o servidor, senão o tempo
 * em tela de cada um seria o que o relógio do aparelho quisesse.
 *
 * Responde 204 porque a tela não usa a resposta — é aviso, não consulta.
 */
export async function POST() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;

  await registrarPresencaRepo(g.user.id);
  return new NextResponse(null, { status: 204 });
}
