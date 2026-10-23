/**
 * Cliente do stream de avisos da catraca (SSE) — uma conexão por aba,
 * compartilhada entre quem escuta (o listener do layout e o modal que espera a
 * foto). O `EventSource` reconecta sozinho; some quando ninguém mais escuta.
 */
import type { AvisoRecepcao } from "@/lib/access/avisos-recepcao";

type Assinante = (aviso: AvisoRecepcao) => void;

let fonte: EventSource | null = null;
const assinantes = new Set<Assinante>();

function garantirConexao() {
  if (fonte || typeof window === "undefined") return;
  fonte = new EventSource("/api/acesso/avisos");
  fonte.addEventListener("aviso", (ev) => {
    let aviso: AvisoRecepcao;
    try {
      aviso = JSON.parse((ev as MessageEvent).data) as AvisoRecepcao;
    } catch {
      return;
    }
    for (const cb of assinantes) cb(aviso);
  });
}

/** Assina os avisos da catraca. Devolve a função para cancelar a assinatura. */
export function assinarAvisosCatraca(cb: Assinante): () => void {
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
