import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { paymentById } from "@/lib/freelandoo/baixa";

/** GET /api/freelandoo/payments/:id — a cobrança agora (reconferida antes do checkout). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const erro = await exigirFreelandoo(req);
  if (erro) return erro;
  const { id } = await params;
  const item = await paymentById(id);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(item);
}
