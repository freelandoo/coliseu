import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { iniciarCadastroFace } from "@/lib/access/enroll";
import { registrarAudit } from "@/lib/access/audit";

export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!g.user || !podePapel(g.user.role as Papel, ["RECEPCAO", "ADMIN"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }
  const body = (await req.json()) as { personId?: string; deviceId?: string };
  if (!body.personId || !body.deviceId) {
    return NextResponse.json({ erro: "personId e deviceId são obrigatórios" }, { status: 400 });
  }
  const r = await iniciarCadastroFace({ personId: body.personId, deviceId: body.deviceId });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 422 });
  await registrarAudit({
    actorType: "USER", actorId: g.user.id, action: "START_ENROLLMENT",
    entity: "Person", entityId: body.personId,
    after: { deviceId: body.deviceId, externalUserId: r.externalUserId, comandoId: r.comando.id },
  });
  return NextResponse.json({ ok: true, comandoId: r.comando.id }, { status: 201 });
}
