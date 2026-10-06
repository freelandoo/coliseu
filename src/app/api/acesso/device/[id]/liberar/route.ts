import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podeModulo, type Papel } from "@/lib/auth/rbac";
import { enfileirarAbertura } from "@/lib/repositories/access";
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

/** Libera um giro na catraca sem cadastro (OPEN). Fica na trilha quem liberou e por quê. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard();
  if (g.erro) return g.erro;
  const { id } = await params;
  const device = await prisma.accessDevice.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!device) return NextResponse.json({ erro: "catraca não encontrada" }, { status: 404 });
  if (device.status !== "ONLINE") {
    return NextResponse.json({ erro: "Catraca offline — o agente da recepção não está respondendo." }, { status: 409 });
  }
  const body = (await req.json().catch(() => ({}))) as { motivo?: string };
  const motivo = String(body.motivo ?? "").trim().slice(0, 120) || undefined;

  const comando = await enfileirarAbertura({ deviceId: id, solicitadoPor: g.user!.nome, motivo });
  await registrarAudit({
    actorType: "USER", actorId: g.user!.id, action: "OPEN_TURNSTILE",
    entity: "AccessDevice", entityId: id, after: { comandoId: comando.id, motivo: motivo ?? null },
  });
  return NextResponse.json({ ok: true, comandoId: comando.id }, { status: 201 });
}

/** Situação da liberação (?cmd=): a tela acompanha até o agente confirmar. */
export async function GET(req: Request, { params }: Ctx) {
  const g = await guard();
  if (g.erro) return g.erro;
  const { id } = await params;
  const cmd = new URL(req.url).searchParams.get("cmd") ?? "";
  const c = await prisma.deviceCommand.findFirst({
    where: { id: cmd, deviceId: id, type: "OPEN" },
    select: { status: true, lastError: true },
  });
  if (!c) return NextResponse.json({ erro: "comando não encontrado" }, { status: 404 });
  return NextResponse.json(c);
}
