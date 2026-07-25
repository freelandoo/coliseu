import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { barramentoMensagens, type EventoMensagem } from "@/lib/whatsapp/eventos";

export const dynamic = "force-dynamic";
// Precisa do runtime Node: EventEmitter + stream de vida longa (não Edge).
export const runtime = "nodejs";

/**
 * GET — stream SSE de avisos de mensagem nova. Não carrega conteúdo: manda só
 * `{ conversaId, direcao }`; o navegador busca o delta nas rotas de dados, que
 * já cuidam de permissão e formatação. Fecha e limpa o listener no disconnect.
 */
export async function GET(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro ?? new Response("não autenticado", { status: 401 });
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return new Response("sem permissão", { status: 403 });
  }

  const encoder = new TextEncoder();
  let limpar = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let fechado = false;
      const enfileirar = (texto: string) => {
        if (fechado) return;
        try {
          controller.enqueue(encoder.encode(texto));
        } catch {
          /* controller já fechado: o abort abaixo resolve */
        }
      };

      enfileirar("event: pronto\ndata: {}\n\n");

      const aoReceber = (e: EventoMensagem) =>
        enfileirar(`event: mensagem\ndata: ${JSON.stringify(e)}\n\n`);
      barramentoMensagens.on("mensagem", aoReceber);

      // Comentário keep-alive: evita que proxies fechem a conexão ociosa.
      const ping = setInterval(() => enfileirar(": keep-alive\n\n"), 25_000);

      limpar = () => {
        if (fechado) return;
        fechado = true;
        clearInterval(ping);
        barramentoMensagens.off("mensagem", aoReceber);
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      req.signal.addEventListener("abort", limpar);
    },
    cancel() {
      limpar();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Desliga o buffering de proxies (nginx/Railway) para o evento sair na hora.
      "X-Accel-Buffering": "no",
    },
  });
}
