import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { excluirPlanosRepo } from "@/lib/repositories/planos";
import { registrarAudit } from "@/lib/access/audit";

/** Exclui os planos selecionados que não têm aluno (ADMIN). Ver excluirPlanosRepo. */
export async function POST(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;
  const body = (await req.json().catch(() => ({}))) as { planoIds?: unknown };
  const planoIds = Array.isArray(body.planoIds) ? body.planoIds.map(String) : [];
  if (planoIds.length === 0) return NextResponse.json({ erro: "Selecione ao menos 1 plano." }, { status: 400 });
  const r = await excluirPlanosRepo(planoIds);
  for (const p of r.excluidos) {
    await registrarAudit({
      actorType: "USER", actorId: g.user.id, action: "DELETE_PLAN",
      entity: "Plan", entityId: p.id, before: { nome: p.nome }, after: { modo: p.modo },
    });
  }
  return NextResponse.json(r);
}
