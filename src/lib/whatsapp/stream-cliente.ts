/**
 * Cliente do stream de mensagens (SSE) — uma conexão por aba, compartilhada.
 *
 * A inbox e a conversa aberta assinam o mesmo `EventSource`: um aviso de
 * mensagem nova chega e cada assinante decide o que buscar. O `EventSource`
 * reconecta sozinho se a conexão cair; some quando ninguém mais escuta.
 */

export interface EventoStream {
  conversaId?: string;
  direcao?: "IN" | "OUT";
}

type Assinante = (evento: EventoStream) => void;

let fonte: EventSource | null = null;
const assinantes = new Set<Assinante>();

function garantirConexao() {
  if (fonte || typeof window === "undefined") return;
  fonte = new EventSource("/api/whatsapp/stream");
  fonte.addEventListener("mensagem", (ev) => {
    let dados: EventoStream = {};
    try {
      dados = JSON.parse((ev as MessageEvent).data) as EventoStream;
    } catch {
      /* aviso sem corpo: ainda vale como "algo mudou" */
    }
    for (const cb of assinantes) cb(dados);
  });
  // onerror: o próprio EventSource reabre; nada a fazer além de deixar seguir.
}

/** Assina os avisos de mensagem. Devolve a função para cancelar a assinatura. */
export function assinarMensagens(cb: Assinante): () => void {
  assinantes.add(cb);
  garantirConexao();
  return () => {
    assinantes.delete(cb);
    if (assinantes.size === 0 && fonte) {
      fonte.close();
      fonte = null;
    }
  };
}
