import { NextResponse } from "next/server";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { baixarPelaFreelandoo } from "@/lib/freelandoo/baixa";

/** POST /api/freelandoo/payments/:id/paid — o aluno pagou pela Freelandoo. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const erro = await exigirFreelandoo(req);
  if (erro) return erro;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const r = await baixarPelaFreelandoo(id, body ?? {});
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}
