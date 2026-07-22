import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { listarConversasRepo } from "@/lib/repositories/whatsapp";
import { podePapel, type Papel } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** GET — lista do inbox. Recepção e admin atendem; técnico não. */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão para atendimento" }, { status: 403 });
  }

  return NextResponse.json({ conversas: await listarConversasRepo() });
}
