import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { contarNaoLidasRepo } from "@/lib/repositories/whatsapp";

export const dynamic = "force-dynamic";

/** GET — soma de não lidas, para o badge do menu Atendimento. */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão para atendimento" }, { status: 403 });
  }

  return NextResponse.json({ naoLidas: await contarNaoLidasRepo() });
}
