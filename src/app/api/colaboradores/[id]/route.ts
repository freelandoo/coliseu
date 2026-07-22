import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { atualizarColaboradorRepo, ColaboradorErro } from "@/lib/repositories/colaboradores";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAPEIS: Role[] = ["ADMIN", "RECEPCAO", "TECNICO"];

/** PATCH — muda o papel, ativa/desativa ou redefine a senha. Só ADMIN. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    role?: string;
    ativo?: boolean;
    senha?: string;
  };

  if (body.role !== undefined && !PAPEIS.includes(body.role as Role)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }

  try {
    const colaborador = await atualizarColaboradorRepo(
      id,
      {
        role: body.role as Role | undefined,
        ativo: body.ativo,
        senha: body.senha,
      },
      g.user.id,
    );
    return NextResponse.json({ colaborador });
  } catch (e) {
    if (e instanceof ColaboradorErro) {
      return NextResponse.json({ erro: e.message }, { status: e.status });
    }
    console.error("[colaboradores] patch", e);
    return NextResponse.json({ erro: "Falha ao atualizar." }, { status: 500 });
  }
}
