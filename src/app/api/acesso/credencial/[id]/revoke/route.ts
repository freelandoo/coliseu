import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { revogarCredencial } from "@/lib/repositories/access";
import { registrarAudit } from "@/lib/access/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!g.user || !podePapel(g.user.role as Papel, ["ADMIN"])) {
    return NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 });
  }
  const { id } = await params;
  const ok = await revogarCredencial(id);
  if (!ok) return NextResponse.json({ erro: "credencial não encontrada" }, { status: 404 });
  await registrarAudit({ actorType: "USER", actorId: g.user.id, action: "REVOKE_CREDENTIAL", entity: "AccessCredential", entityId: id });
  return NextResponse.json({ ok: true });
}
