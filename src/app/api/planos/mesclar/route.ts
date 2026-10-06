import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { MesclaInvalida, mesclarPlanosRepo } from "@/lib/repositories/planos";
import { registrarAudit } from "@/lib/access/audit";

/** Mescla 2+ planos em um (ADMIN). Ver mesclarPlanosRepo. */
export async function POST(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;
  const body = (await req.json().catch(() => ({}))) as {
    planoIds?: string[];
    destinoId?: string;
    nome?: string;
    valorMensal?: number;
    duracaoDias?: number;
  };
  try {
    const r = await mesclarPlanosRepo({
      planoIds: Array.isArray(body.planoIds) ? body.planoIds.map(String) : [],
      destinoId: String(body.destinoId ?? ""),
      nome: String(body.nome ?? ""),
      valorMensal: Number(body.valorMensal),
      duracaoDias: Number(body.duracaoDias),
    });
    await registrarAudit({
      actorType: "USER", actorId: g.user.id, action: "MERGE_PLANS",
      entity: "Plan", entityId: r.plano.id,
      before: { planoIds: body.planoIds, arquivados: r.arquivados },
      after: { nome: r.plano.nome, valorMensal: r.plano.valorMensal, duracaoDias: r.plano.duracaoDias, matriculasMovidas: r.matriculasMovidas },
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof MesclaInvalida) return NextResponse.json({ erro: e.message }, { status: 400 });
    throw e;
  }
}
