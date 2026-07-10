import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/session";
import { podePapel, type Papel } from "@/lib/auth/rbac";

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

/** Como exigirSessaoApi, mas exige papel ADMIN. */
export async function exigirAdminApi() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g;
  if (!podePapel(g.user.role as Papel, ["ADMIN"])) {
    return { user: null as null, erro: NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 }) };
  }
  return g;
}
