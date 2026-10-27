/**
 * Avisos da catraca para a recepção, em tempo real (SSE).
 *
 * Quem chega e não entra abre sozinho o modal de matrícula na tela de quem está
 * na recepção: rosto desconhecido vira "nova matrícula"; aluno reconhecido sem
 * matrícula ativa vira "renovar". A captura de face pedida por esse modal volta
 * pelo mesmo canal, com a foto, para aparecer na ficha na hora.
 *
 * Mesmo desenho do barramento do WhatsApp: um `EventEmitter` no processo (o
 * serviço roda em 1 instância). A foto só passa por aqui — não é gravada.
 */
import { EventEmitter } from "node:events";

export type AvisoRecepcao =
  | { tipo: "nao-identificado"; deviceId: string; quando: string }
  | { tipo: "sem-matricula"; deviceId: string; personId: string; nome: string; quando: string }
  | { tipo: "face"; personId: string; ok: boolean; imagem?: string; erro?: string }
  /** Entrou na carência (3 dias depois do vencimento): a recepção avisa e cobra. */
  | { tipo: "carencia"; personId: string; nome: string; texto: string; restam: number; quando: string };

const g = globalThis as unknown as { __coliseuAvisosRecepcao?: EventEmitter; __coliseuAvisosUltimo?: Map<string, number> };
export const barramentoRecepcao = g.__coliseuAvisosRecepcao ?? new EventEmitter();
barramentoRecepcao.setMaxListeners(100);
g.__coliseuAvisosRecepcao = barramentoRecepcao;

/** Último aviso por chave (aparelho ou pessoa) — a mesma pessoa tentando de novo não reabre o modal. */
const ultimo = g.__coliseuAvisosUltimo ?? new Map<string, number>();
g.__coliseuAvisosUltimo = ultimo;

/** Janela em que uma nova tentativa da mesma origem não gera outro aviso. */
export const JANELA_AVISO_MS = 45_000;

function dentroDaJanela(chave: string, agora: number): boolean {
  const antes = ultimo.get(chave);
  if (antes !== undefined && agora - antes < JANELA_AVISO_MS) return true;
  ultimo.set(chave, agora);
  return false;
}

/** Publica um aviso de catraca; devolve false quando caiu na janela anti-repetição. */
export function avisarRecepcao(aviso: AvisoRecepcao, agora = Date.now()): boolean {
  if (aviso.tipo === "nao-identificado" && dentroDaJanela(`dev:${aviso.deviceId}`, agora)) return false;
  if (aviso.tipo === "sem-matricula" && dentroDaJanela(`pes:${aviso.personId}`, agora)) return false;
  if (aviso.tipo === "carencia" && dentroDaJanela(`car:${aviso.personId}`, agora)) return false;
  barramentoRecepcao.emit("aviso", aviso);
  return true;
}

/** Só para testes: zera a janela anti-repetição. */
export function limparJanelaAvisos(): void {
  ultimo.clear();
}
