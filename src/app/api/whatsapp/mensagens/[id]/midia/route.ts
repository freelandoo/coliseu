import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { dadosMidiaMensagemRepo } from "@/lib/repositories/whatsapp";
import { baixarMidia, configEvolution, EvolutionError } from "@/lib/whatsapp/evolution";

export const dynamic = "force-dynamic";

/**
 * GET — foto, áudio ou vídeo de uma mensagem recebida.
 *
 * O arquivo vem da Evolution na hora e é entregue ao navegador sem passar por
 * disco: o Coliseu não guarda mídia de conversa. O cache é `private` e curto —
 * reabrir a mesma conversa não repete o download, mas nada fica em cache
 * compartilhado, porque isso é conteúdo de conversa de aluno.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ erro: "sem permissão para atendimento" }, { status: 403 });
  }

  const cfg = configEvolution();
  if (!cfg) return NextResponse.json({ erro: "WhatsApp não configurado." }, { status: 503 });

  const { id } = await ctx.params;
  const dados = await dadosMidiaMensagemRepo(id);
  if (!dados) return NextResponse.json({ erro: "mensagem sem mídia" }, { status: 404 });

  try {
    const midia = await baixarMidia(cfg, dados.instancia, dados.waMessageId);
    return new NextResponse(new Uint8Array(midia.bytes), {
      headers: {
        "Content-Type": midia.mimetype,
        "Content-Length": String(midia.bytes.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(midia.nomeArquivo)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    if (e instanceof EvolutionError) return NextResponse.json({ erro: e.message }, { status: e.status });
    console.error("[whatsapp] falha ao baixar mídia", e);
    return NextResponse.json({ erro: "Falha ao buscar a mídia." }, { status: 502 });
  }
}
