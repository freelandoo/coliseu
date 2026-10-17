/**
 * Histórico da conversa em páginas — regras puras, usadas pelo servidor (para
 * ler e montar cursores) e pela tela (para juntar o que chega sem perder nada).
 *
 * A ordem é sempre (enviadaEm, id). O WhatsApp marca o tempo em segundos, então
 * várias mensagens dividem o mesmo instante: o id desempata e faz o cursor
 * apontar para uma mensagem só — sem ele, a página seguinte pularia ou
 * repetiria as que estavam no mesmo segundo.
 */
import type { ConversaResumo, MensagemItem } from "@/lib/types";

/** Quantas mensagens a conversa abre (as mais recentes). */
export const PAGINA_MENSAGENS = 50;
/** Teto de uma página pedida pela tela — ninguém baixa o histórico inteiro de uma vez. */
export const TETO_PAGINA_MENSAGENS = 200;
/** Quantas conversas cada página da lista traz. */
export const PAGINA_CONVERSAS = 100;

/**
 * Recuo do cursor de novidades. Mensagem pode ser gravada depois de outra mais
 * nova (webhook atrasado, eco do aparelho): pedir "depois da última" deixaria
 * essa de fora. Relendo uma pequena janela para trás e deduplicando por id, a
 * atrasada entra.
 */
export const JANELA_RELEITURA_MS = 2 * 60_000;

export interface Cursor {
  em: string; // ISO
  id: string;
}

const ID = /^[A-Za-z0-9_:-]{1,80}$/;

/** "2026-10-17T12:00:00.000Z~ckx…" — opaco para a tela, legível no servidor. */
export function codificarCursor(c: { em: string; id: string }): string {
  return `${c.em}~${c.id}`;
}

/** Cursor válido ou `null`: data de verdade e id no formato dos nossos ids. */
export function lerCursor(bruto: string | null | undefined): Cursor | null {
  if (!bruto) return null;
  const i = bruto.lastIndexOf("~");
  if (i <= 0) return null;
  const em = bruto.slice(0, i);
  const id = bruto.slice(i + 1);
  if (!ID.test(id) || Number.isNaN(new Date(em).getTime())) return null;
  return { em: new Date(em).toISOString(), id };
}

/** Limite pedido, dentro do teto; lixo vira o padrão. */
export function lerLimite(bruto: string | null | undefined, padrao: number, teto: number): number {
  const n = Number(bruto);
  if (!bruto || !Number.isInteger(n) || n < 1) return padrao;
  return Math.min(n, teto);
}

/** Id de bolha otimista: único na aba, nunca confundido com um id do banco. */
export function novoIdOtimista(): string {
  return `tmp:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Bolha que só existe na tela até o servidor responder. */
export function ehOtimista(m: { id: string }): boolean {
  return m.id.startsWith("tmp:");
}

/**
 * Estado de envio de uma bolha da tela. O servidor não diz se a mensagem
 * chegou ao aparelho — só se foi aceita para envio (sem `erro`) ou falhou. Por
 * isso não existe "entregue" nem "lida" aqui.
 */
export type EstadoEnvio = "enviando" | "falhou" | "incerto";

export type MensagemTela = MensagemItem & { envio?: EstadoEnvio };

function compararMensagens(a: MensagemItem, b: MensagemItem): number {
  if (a.enviadaEm !== b.enviadaEm) return a.enviadaEm < b.enviadaEm ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Junta mensagens novas ao histórico carregado. Deduplica por id (a versão
 * que chegou por último vale), ordena por (enviadaEm, id) e deixa as bolhas
 * otimistas no fim, na ordem em que foram criadas — o relógio delas é do
 * aparelho e não se compara com o do servidor.
 *
 * Nunca descarta mensagem já carregada: um lote é só o que veio nele.
 */
export function mesclarMensagens(atual: MensagemTela[], novas: MensagemItem[]): MensagemTela[] {
  if (novas.length === 0) return atual;
  const porId = new Map<string, MensagemTela>();
  const otimistas: MensagemTela[] = [];
  for (const m of atual) {
    if (ehOtimista(m)) otimistas.push(m);
    else porId.set(m.id, m);
  }
  for (const m of novas) porId.set(m.id, m);
  const reais = [...porId.values()].sort(compararMensagens);
  return resolverIncertas([...reais, ...otimistas]);
}

/**
 * Troca a bolha otimista pela mensagem que o servidor gravou, sem tocar nas
 * outras bolhas em voo (envios rápidos em sequência).
 */
export function confirmarOtimista(
  atual: MensagemTela[],
  tempId: string,
  gravada: MensagemItem | null,
  pagina: MensagemItem[] = [],
): MensagemTela[] {
  const sem = atual.filter((m) => m.id !== tempId);
  return mesclarMensagens(sem, gravada ? [...pagina, gravada] : pagina);
}

/** Marca a bolha otimista com o desfecho conhecido (ou desconhecido). */
export function marcarOtimista(
  atual: MensagemTela[],
  tempId: string,
  envio: EstadoEnvio,
  erro: string | null,
): MensagemTela[] {
  return atual.map((m) => (m.id === tempId ? { ...m, envio, erro } : m));
}

/**
 * Bolha "sem confirmação" cuja mensagem de verdade apareceu depois (pela
 * atualização em tempo real): mesma saída, mesmo texto, gravada a partir de
 * pouco antes do clique. A bolha da tela sai — a do servidor fica. Não é
 * reenvio nem prova de entrega: só evita mostrar a mesma mensagem duas vezes.
 */
export function resolverIncertas(lista: MensagemTela[]): MensagemTela[] {
  const incertas = lista.filter((m) => m.envio === "incerto");
  if (incertas.length === 0) return lista;
  const usadas = new Set<string>();
  const remover = new Set<string>();
  for (const t of incertas) {
    const desde = new Date(t.enviadaEm).getTime() - JANELA_RELEITURA_MS;
    const real = lista.find(
      (m) =>
        !ehOtimista(m) &&
        !usadas.has(m.id) &&
        m.direcao === "OUT" &&
        m.texto === t.texto &&
        new Date(m.enviadaEm).getTime() >= desde,
    );
    if (real) {
      usadas.add(real.id);
      remover.add(t.id);
    }
  }
  return remover.size ? lista.filter((m) => !remover.has(m.id)) : lista;
}

/** Última mensagem confirmada pelo servidor — base do cursor de novidades. */
export function ultimaConfirmada(lista: MensagemTela[]): MensagemItem | null {
  for (let i = lista.length - 1; i >= 0; i--) if (!ehOtimista(lista[i])) return lista[i];
  return null;
}

/** Primeira mensagem carregada — base do cursor de "anteriores". */
export function primeiraConfirmada(lista: MensagemTela[]): MensagemItem | null {
  return lista.find((m) => !ehOtimista(m)) ?? null;
}

/**
 * Cursor das novidades: a última confirmada, recuada pela janela de releitura.
 * O id vazio faz o recorte valer para tudo a partir daquele instante.
 */
export function cursorDeNovidades(lista: MensagemTela[]): string | null {
  const ultima = ultimaConfirmada(lista);
  if (!ultima) return null;
  const em = new Date(new Date(ultima.enviadaEm).getTime() - JANELA_RELEITURA_MS).toISOString();
  return codificarCursor({ em, id: "0" });
}

/* ---------- lista de conversas ---------- */

function compararConversas(a: ConversaResumo, b: ConversaResumo): number {
  if (a.ultimaMensagemEm !== b.ultimaMensagemEm) return a.ultimaMensagemEm > b.ultimaMensagemEm ? -1 : 1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function ordenarConversas<T extends ConversaResumo>(lista: T[]): T[] {
  return [...lista].sort(compararConversas);
}

/**
 * Atualiza a lista carregada com a primeira página recém-buscada.
 *
 * - Conversa que veio na página: dados novos.
 * - Conversa carregada de páginas seguintes (ou aberta por busca/link): fica.
 *   A primeira página não é a lista inteira — sumir com o resto faria a conversa
 *   aberta desaparecer da lista no meio do atendimento.
 * - `manterOrdem`: enquanto a pessoa está com o ponteiro ou o foco na lista,
 *   ninguém muda de lugar (o clique cairia em outra conversa); as novas entram
 *   no fim e a ordem se ajeita quando ela sai da lista.
 */
export function mesclarConversas<T extends ConversaResumo>(
  atual: T[],
  pagina: T[],
  { manterOrdem = false }: { manterOrdem?: boolean } = {},
): T[] {
  const frescas = new Map(pagina.map((c) => [c.id, c]));
  const atualizadas = atual.map((c) => frescas.get(c.id) ?? c);
  const conhecidas = new Set(atual.map((c) => c.id));
  const novas = pagina.filter((c) => !conhecidas.has(c.id));
  if (manterOrdem) return [...atualizadas, ...novas];
  return ordenarConversas([...atualizadas, ...novas]);
}
