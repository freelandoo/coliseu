import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { enfileirarShutdown } from "@/lib/repositories/access";
import { registrarAudit } from "@/lib/access/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Enfileira SHUTDOWN para o agente do device — só o agente de simulação (fake) obedece. */
export async function POST(_req: Request, { params }: Ctx) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;

  const { id } = await params;
  const device = await prisma.accessDevice.findUnique({ where: { id }, select: { id: true } });
  if (!device) return NextResponse.json({ erro: "catraca não encontrada" }, { status: 404 });

  const comando = await enfileirarShutdown(id);
  await registrarAudit({
    actorType: "USER", actorId: g.user.id, action: "STOP_AGENT",
    entity: "AccessDevice", entityId: id, after: { comandoId: comando.id },
  });
  return NextResponse.json({ ok: true, comandoId: comando.id }, { status: 201 });
}
