import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { buscarConversasRepo } from "@/lib/repositories/whatsapp";

export const dynamic = "force-dynamic";

/** Termo de uma letra casaria com quase todo o histórico — não é busca, é dump. */
const MINIMO = 2;

/**
 * GET `?q=` — conversas pelo nome, telefone ou por algo escrito no histórico.
 *
 * A tela filtra na hora a lista que já carregou, mas ela é só a primeira
 * página: conversa antiga (fora da lista) ou palavra no meio do histórico só o
 * banco acha. `termo` volta junto, para a tela casar a resposta com a busca
 * que a originou.
 */
export async function GET(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < MINIMO) return NextResponse.json({ conversas: [], termo: q });

  return NextResponse.json({ conversas: await buscarConversasRepo(q), termo: q });
}
