import { NextResponse } from "next/server";
import { exigirDesenvolvedorApi } from "@/lib/auth/api-guard";
import { obterMensagensBackupRepo } from "@/lib/repositories/whatsapp-backup";

export const dynamic = "force-dynamic";

/** GET — histórico guardado de um backup, para conferir antes de restaurar. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirDesenvolvedorApi();
  if (g.erro) return g.erro;

  const { id } = await ctx.params;
  return NextResponse.json({ mensagens: await obterMensagensBackupRepo(id) });
}
