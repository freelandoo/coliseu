import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { iniciarCadastroFace } from "@/lib/access/enroll";
import { registrarAudit } from "@/lib/access/audit";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!g.user || !podePapel(g.user.role as Papel, ["RECEPCAO", "ADMIN"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }
  const body = (await req.json()) as { personId?: string; deviceId?: string; permitirLead?: boolean };
  if (!body.personId) {
    return NextResponse.json({ erro: "personId é obrigatório" }, { status: 400 });
  }
  // Sem leitor escolhido (botão "Cadastrar facial" da ficha): o que está online
  // — a academia tem um só; com mais de um, o que deu sinal por último.
  if (!body.deviceId) {
    const leitor =
      (await prisma.accessDevice.findFirst({ where: { status: "ONLINE" }, orderBy: { lastHeartbeatAt: "desc" } })) ??
      (await prisma.accessDevice.findFirst({ orderBy: { lastHeartbeatAt: { sort: "desc", nulls: "last" } } }));
    if (!leitor) return NextResponse.json({ erro: "Nenhuma catraca cadastrada" }, { status: 422 });
    body.deviceId = leitor.id;
  }
  const r = await iniciarCadastroFace({
    personId: body.personId, deviceId: body.deviceId, permitirLead: body.permitirLead === true,
  });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 422 });
  await registrarAudit({
    actorType: "USER", actorId: g.user.id, action: "START_ENROLLMENT",
    entity: "Person", entityId: body.personId,
    after: { deviceId: body.deviceId, externalUserId: r.externalUserId, comandoId: r.comando.id },
  });
  return NextResponse.json({ ok: true, comandoId: r.comando.id }, { status: 201 });
}
