import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { buscarConversasPorMensagemRepo } from "@/lib/repositories/whatsapp";

export const dynamic = "force-dynamic";

/** Termo de uma letra casaria com quase todo o histórico — não é busca, é dump. */
const MINIMO = 2;

/**
 * GET `?q=` — conversas em que alguém escreveu o termo.
 *
 * Complementa a busca da tela: nome e telefone o navegador filtra sozinho na
 * lista que já carregou; palavra que ficou no meio do histórico (ou conversa
 * antiga demais para estar na lista) só o banco acha.
 */
export async function GET(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < MINIMO) return NextResponse.json({ conversas: [] });

  return NextResponse.json({ conversas: await buscarConversasPorMensagemRepo(q) });
}
