import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/session";

/**
 * Guard de sessão para rotas /api. Uso:
 *   const g = await exigirSessaoApi();
 *   if (g.erro) return g.erro;
 *   // g.user disponível
 */
export async function exigirSessaoApi() {
  const user = await usuarioAtual();
  if (!user) {
    return { user: null as null, erro: NextResponse.json({ erro: "não autenticado" }, { status: 401 }) };
  }
  return { user, erro: null as null };
}
