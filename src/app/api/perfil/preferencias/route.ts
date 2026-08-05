import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirSessaoApi } from "@/lib/auth/api-guard";

/**
 * Preferências da própria conta. Qualquer sessão salva as suas — não há id no
 * corpo justamente para que ninguém edite a preferência de outro colaborador.
 */
export async function PATCH(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro!;

  const { enterEnvia } = (await req.json().catch(() => ({}))) as { enterEnvia?: unknown };
  if (typeof enterEnvia !== "boolean") {
    return NextResponse.json({ erro: "enterEnvia deve ser true ou false" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: g.user.id }, data: { enterEnvia } });
  return NextResponse.json({ ok: true, enterEnvia });
}
