import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { reabrirPelaFreelandoo } from "@/lib/freelandoo/baixa";

/** POST /api/freelandoo/payments/:id/reopened — estorno na Freelandoo antes do repasse. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const erro = await exigirFreelandoo(req);
  if (erro) return erro;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const r = await reabrirPelaFreelandoo(id, body ?? {});
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
