/**
 * Como a tela lê o desfecho de uma operação no servidor.
 *
 * Três respostas, nunca duas:
 *
 * - `ok`: o servidor respondeu 2xx com o formato esperado — só aqui a tela
 *   pode dizer que deu certo.
 * - `falha`: o servidor recusou e disse por quê (4xx, ou 5xx com `{ erro }`
 *   que a rota tratou). Nada foi feito, ou o próprio erro diz o que foi.
 * - `desconhecido`: a resposta se perdeu (rede, tempo esgotado), veio 5xx sem
 *   explicação ou 2xx num formato que não é o combinado. A operação PODE ter
 *   acontecido — a tela não afirma nem que deu certo nem que não deu, e nunca
 *   repete sozinha (a cobrança, a mensagem ou o cadastro podem já existir).
 */

export type Resultado<T> =
  | { tipo: "ok"; dados: T }
  | { tipo: "falha"; status: number; erro: string; corpo: Record<string, unknown> }
  | { tipo: "desconhecido"; motivo: "rede" | "tempo" | "resposta"; status?: number };

/** Tempo máximo de espera de uma mutação antes de virar "sem confirmação". */
export const TEMPO_MUTACAO_MS = 60_000;

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Lê a resposta de um `fetch`. `valida` confere que o corpo de sucesso tem o
 * que a tela vai usar (id, status…): 200 com corpo errado não vira sucesso.
 */
export async function lerResultado<T>(
  requisicao: Promise<Response>,
  valida: (corpo: unknown) => corpo is T,
  erroPadrao = "Não foi possível concluir.",
): Promise<Resultado<T>> {
  let r: Response;
  try {
    r = await requisicao;
  } catch (e) {
    const tempo = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    return { tipo: "desconhecido", motivo: tempo ? "tempo" : "rede" };
  }

  let corpo: unknown = null;
  try {
    corpo = await r.json();
  } catch {
    corpo = null;
  }

  if (r.ok) {
    return valida(corpo)
      ? { tipo: "ok", dados: corpo }
      : { tipo: "desconhecido", motivo: "resposta", status: r.status };
  }

  const erro = ehObjeto(corpo) && typeof corpo.erro === "string" && corpo.erro.trim() ? corpo.erro : null;
  // 5xx sem explicação: a rota pode ter caído no meio do caminho.
  if (r.status >= 500 && !erro) return { tipo: "desconhecido", motivo: "resposta", status: r.status };
  return { tipo: "falha", status: r.status, erro: erro ?? erroPadrao, corpo: ehObjeto(corpo) ? corpo : {} };
}

/** Sinal de tempo esgotado, quando o navegador oferece (todos os atuais). */
export function sinalDeTempo(ms = TEMPO_MUTACAO_MS): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(ms) : undefined;
}

/* ---------- validadores comuns ---------- */

export function temId(v: unknown): v is { id: string } {
  return ehObjeto(v) && typeof v.id === "string" && v.id.length > 0;
}

export function temOk(v: unknown): v is { ok: true } {
  return ehObjeto(v) && v.ok === true;
}

/** Mensagem curta para o "não sabemos o que aconteceu", com o que fazer. */
export function textoDesconhecido(oQue: string): string {
  return `Sem confirmação do servidor. ${oQue} pode ter sido feito — confira antes de tentar de novo.`;
}
