import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podeModulo, type Papel } from "@/lib/auth/rbac";
import { corrigirAcesso, diagnosticarAcesso } from "@/lib/access/diagnostico";
import { registrarAudit } from "@/lib/access/audit";

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { erro: g.erro!, user: null };
  if (!podeModulo(g.user.role as Papel, "acesso")) {
    return { erro: NextResponse.json({ erro: "sem acesso à catraca" }, { status: 403 }), user: null };
  }
  return { erro: null, user: g.user };
}

/** Diagnóstico: por que o aluno passa (ou não) na catraca. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard();
  if (g.erro) return g.erro;
  const { id } = await params;
  const d = await diagnosticarAcesso(id);
  if (!d) return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  return NextResponse.json(d);
}

/** Corrigir agora: reenvia o aluno ao aparelho e a decisão atual de acesso. */
export async function POST(_req: Request, { params }: Ctx) {
  const g = await guard();
  if (g.erro) return g.erro;
  const { id } = await params;
  const r = await corrigirAcesso(id);
  await registrarAudit({
    actorType: "USER", actorId: g.user!.id, action: "FIX_ACCESS", entity: "Person", entityId: id, after: r,
  });
  return NextResponse.json({ ...r, diagnostico: await diagnosticarAcesso(id) });
}
