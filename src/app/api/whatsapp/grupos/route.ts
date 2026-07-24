import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { instanciaAtualRepo, renomearGruposRepo } from "@/lib/repositories/whatsapp";
import { configEvolution, listarGrupos } from "@/lib/whatsapp/evolution";

export const dynamic = "force-dynamic";

/** Uma sincronização a cada 5 min basta: nome de grupo quase não muda. */
const INTERVALO_MS = 5 * 60_000;
let ultimaSincronizacao = 0;

/**
 * POST — busca na Evolution o assunto dos grupos e renomeia as conversas.
 *
 * O `messages.upsert` traz o nome de quem escreveu, nunca o do grupo; sem esta
 * chamada o grupo apareceria na inbox como "Grupo do WhatsApp". A inbox aciona
 * isto quando vê grupo sem nome, e a janela evita bater na Evolution a cada
 * abertura de tela. Só leitura: não cria, não envia, não mexe na sessão.
 */
export async function POST() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão para atendimento" }, { status: 403 });
  }

  const agora = Date.now();
  if (agora - ultimaSincronizacao < INTERVALO_MS) {
    return NextResponse.json({ ok: true, renomeados: 0, motivo: "sincronizado há pouco" });
  }

  const cfg = configEvolution();
  const instancia = await instanciaAtualRepo();
  if (!cfg || !instancia || instancia.status !== "CONNECTED") {
    return NextResponse.json({ ok: true, renomeados: 0, motivo: "whatsapp indisponível" });
  }

  ultimaSincronizacao = agora;
  const assuntos = await listarGrupos(cfg, instancia.evolutionInstance);
  return NextResponse.json({ ok: true, renomeados: await renomearGruposRepo(assuntos) });
}
