/**
 * Barramento de eventos de mensagem — ponte para o tempo real (SSE).
 *
 * É um `EventEmitter` único no processo: quem grava uma mensagem nova (webhook
 * ou resposta da recepção) publica aqui, e as conexões SSE abertas repassam o
 * aviso ao navegador, que então busca o delta. Só trafega o aviso, nunca o
 * conteúdo — a autorização e a formatação continuam nas rotas de dados.
 *
 * INVARIANTE: este módulo não importa `@/lib/whatsapp/evolution` (o que envia).
 * Publicar um aviso não é responder ninguém — a ingestão segue sem alcançar o
 * envio, como o teste de arquitetura garante.
 *
 * Válido porque a produção roda uma única instância (ver memória de infra). Se
 * um dia escalar para 2+ réplicas, trocar este emitter por Redis pub/sub — o
 * `redis` do projeto já existe — mantendo a mesma interface.
 */

import { EventEmitter } from "node:events";

export interface EventoMensagem {
  conversaId: string;
  direcao: "IN" | "OUT";
}

// Singleton preso ao globalThis: sobrevive ao HMR do dev e é único no processo.
const g = globalThis as unknown as { __coliseuBarramentoMsg?: EventEmitter };
export const barramentoMensagens = g.__coliseuBarramentoMsg ?? new EventEmitter();
// Muitas conexões SSE simultâneas são esperadas; sem limite de listeners.
barramentoMensagens.setMaxListeners(0);
if (!g.__coliseuBarramentoMsg) g.__coliseuBarramentoMsg = barramentoMensagens;

export function publicarMensagem(evento: EventoMensagem): void {
  barramentoMensagens.emit("mensagem", evento);
}
