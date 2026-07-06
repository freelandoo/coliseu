import { NextResponse } from "next/server";
import { removerDespesa } from "@/lib/store";
import { exigirSessaoApi } from "@/lib/auth/api-guard";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  const ok = await removerDespesa(id);
  if (!ok) {
    return NextResponse.json({ erro: "Despesa não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
