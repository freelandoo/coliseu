import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import {
  ColaboradorErro,
  criarColaboradorRepo,
  listarColaboradoresRepo,
  sugerirLoginRepo,
} from "@/lib/repositories/colaboradores";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAPEIS: Role[] = ["ADMIN", "RECEPCAO", "TECNICO"];

function tratar(e: unknown) {
  if (e instanceof ColaboradorErro) return NextResponse.json({ erro: e.message }, { status: e.status });
  console.error("[colaboradores]", e);
  return NextResponse.json({ erro: "Falha ao processar." }, { status: 500 });
}

/** GET — lista de quem tem acesso ao sistema. Só ADMIN. */
export async function GET() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  return NextResponse.json({ colaboradores: await listarColaboradoresRepo() });
}

/** POST — cria um acesso. A senha vem do admin e é provisória por definição. */
export async function POST(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;

  const body = (await req.json().catch(() => ({}))) as {
    nome?: string;
    login?: string;
    email?: string;
    senha?: string;
    role?: string;
    personId?: string;
  };

  if (!body.nome?.trim() || !body.senha) {
    return NextResponse.json({ erro: "Informe nome e senha." }, { status: 400 });
  }
  const role = (body.role ?? "RECEPCAO") as Role;
  if (!PAPEIS.includes(role)) {
    return NextResponse.json({ erro: "Papel inválido." }, { status: 400 });
  }

  try {
    const colaborador = await criarColaboradorRepo({
      nome: body.nome,
      login: body.login || (await sugerirLoginRepo(body.nome)),
      email: body.email,
      senha: body.senha,
      role,
      personId: body.personId,
    });
    return NextResponse.json({ colaborador }, { status: 201 });
  } catch (e) {
    return tratar(e);
  }
}
