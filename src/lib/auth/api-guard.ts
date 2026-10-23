import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/session";
import { podeBackup, podeModulo, podePapel, type Modulo, type Papel } from "@/lib/auth/rbac";

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

/**
 * Como exigirSessaoApi, mas exige um dos módulos — o mesmo mapa que guarda as
 * páginas. Cadastro de pessoa é de quem vê alunos ou captação; o técnico (só
 * catraca) não lista nem edita ninguém por aqui.
 */
export async function exigirModuloApi(...modulos: Modulo[]) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g;
  if (!modulos.some((m) => podeModulo(g.user.role as Papel, m))) {
    return { user: null as null, erro: NextResponse.json({ erro: "sem acesso a este módulo" }, { status: 403 }) };
  }
  return g;
}

/**
 * Como exigirSessaoApi, mas exige a conta de manutenção — a lixeira de
 * conversas é dela, e ser ADMIN não basta.
 */
export async function exigirDesenvolvedorApi() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g;
  if (!podeBackup(g.user)) {
    return {
      user: null as null,
      erro: NextResponse.json({ erro: "acesso restrito ao desenvolvedor" }, { status: 403 }),
    };
  }
  return g;
}
