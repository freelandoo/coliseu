import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { cobrancaDaPessoa, registrarEnvioManual } from "@/lib/billing/regua-cobranca";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Linha "Cobrança enviada" da ficha + registro de cobranças (últimos 3 meses). */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  return NextResponse.json(await cobrancaDaPessoa(id));
}

/** A recepção cobrou à mão (copiou o link ou abriu o WhatsApp). */
export async function POST(req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { canal?: string; paymentId?: string };
  if (body.canal !== "link" && body.canal !== "whatsapp") {
    return NextResponse.json({ erro: "canal inválido" }, { status: 400 });
  }
  if (!(await prisma.person.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  // A parcela tem de ser desta pessoa — id de outra no corpo vira registro sem parcela.
  const parcela = body.paymentId
    ? await prisma.payment.findFirst({ where: { id: body.paymentId, personId: id }, select: { id: true } })
    : null;
  await registrarEnvioManual({ personId: id, paymentId: parcela?.id, canal: body.canal, porUsuario: g.user.nome });
  return NextResponse.json({ ok: true }, { status: 201 });
}
