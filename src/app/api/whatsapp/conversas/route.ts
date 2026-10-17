import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { paginaConversasRepo } from "@/lib/repositories/whatsapp";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { lerCursor, lerLimite, PAGINA_CONVERSAS } from "@/lib/whatsapp/historico";

export const dynamic = "force-dynamic";

/**
 * GET — lista do inbox, em páginas. Recepção e admin atendem; técnico não.
 * `?antes=<cursor>` traz a página seguinte; `proximo` é o cursor dela (null no
 * fim). `limite` opcional, até 100.
 */
export async function GET(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão para atendimento" }, { status: 403 });
  }

  const busca = new URL(req.url).searchParams;
  const antes = busca.has("antes") ? lerCursor(busca.get("antes")) : null;
  if (busca.has("antes") && !antes) {
    return NextResponse.json({ erro: "cursor inválido" }, { status: 400 });
  }
  const limite = lerLimite(busca.get("limite"), PAGINA_CONVERSAS, PAGINA_CONVERSAS);
  return NextResponse.json(await paginaConversasRepo({ antes, limite }));
}
