import { NextResponse } from "next/server";
import { exigirDesenvolvedorApi } from "@/lib/auth/api-guard";
import { listarBackupsRepo } from "@/lib/repositories/whatsapp-backup";

export const dynamic = "force-dynamic";

/**
 * GET — lixeira de conversas. `?de=YYYY-MM-DD&ate=YYYY-MM-DD` recorta pelo dia
 * da exclusão; sem filtro, devolve as mais recentes.
 */
export async function GET(req: Request) {
  const g = await exigirDesenvolvedorApi();
  if (g.erro) return g.erro;

  const q = new URL(req.url).searchParams;
  const backups = await listarBackupsRepo({
    de: q.get("de") ?? undefined,
    ate: q.get("ate") ?? undefined,
  });

  return NextResponse.json({ backups });
}
