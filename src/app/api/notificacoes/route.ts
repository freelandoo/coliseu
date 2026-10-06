import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { listarNotificacoesRepo, marcarNotificacoesLidasRepo } from "@/lib/notificacoes";

/** Avisos do usuário logado (sininho). Quem não é admin recebe lista vazia. */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  const { itens, naoLidas } = await listarNotificacoesRepo(g.user.id);
  return NextResponse.json({ itens, naoLidas });
}

/** Marca todos os avisos do usuário como lidos (abriu o sininho). */
export async function POST() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  const marcadas = await marcarNotificacoesLidasRepo(g.user.id);
  return NextResponse.json({ marcadas });
}
