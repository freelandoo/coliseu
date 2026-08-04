import { NextResponse } from "next/server";
import { exigirDesenvolvedorApi } from "@/lib/auth/api-guard";
import { BackupErro, restaurarBackupRepo } from "@/lib/repositories/whatsapp-backup";

export const dynamic = "force-dynamic";

/** POST — devolve a conversa guardada ao atendimento. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirDesenvolvedorApi();
  if (g.erro) return g.erro;

  const { id } = await ctx.params;
  try {
    const r = await restaurarBackupRepo(id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof BackupErro) {
      return NextResponse.json({ erro: e.message }, { status: e.status });
    }
    throw e;
  }
}
