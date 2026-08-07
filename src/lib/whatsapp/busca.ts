/**
 * Busca na lista de conversas do Atendimento.
 *
 * Quem procura no balcão digita de tudo: um pedaço do nome ("jessi"), o
 * telefone de qualquer jeito ("98017", "(11) 98017-7850") ou uma palavra que
 * lembra da conversa ("bandagem"). Nome e telefone são casados aqui mesmo, na
 * lista que já está na tela; palavra que só aparece no meio do histórico é o
 * servidor que acha.
 *
 * A barra de bandeiras em cima da busca é o outro corte da mesma lista: não
 * "quem eu procuro", e sim "em que ponto do funil estão os que eu quero ver
 * agora".
 */

import type { ConversaInteresse } from "@/lib/types";

/** Tira acento, caixa e espaço de sobra — "João" e "joao" são a mesma busca. */
export function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function digitos(v: string): string {
  return v.replace(/\D/g, "");
}

/**
 * Casa o termo com o que a linha da lista mostra: nome, telefone e a última
 * mensagem. Com três ou mais dígitos, tenta também o telefone — comparando só
 * os números, para "(11) 98017-7850" ser achado por "980177850".
 */
export function casaConversa(
  c: { nome: string; telefone: string; preview: string },
  termo: string,
): boolean {
  const t = normalizar(termo);
  if (!t) return true;

  const numeros = digitos(termo);
  if (numeros.length >= 3 && digitos(c.telefone).includes(numeros)) return true;

  return normalizar(c.nome).includes(t) || normalizar(c.preview).includes(t);
}

/**
 * Ordem das bandeiras na barra de filtro: a do funil, a mesma das abas da
 * Captação — entra, qualifica, se interessa, fecha ou perde.
 */
export const ORDEM_BANDEIRAS: ConversaInteresse[] = [
  "nao_classificado",
  "sem_interesse",
  "com_interesse",
  "convertido",
  "perdido",
];

/**
 * Filtra pelas bandeiras escolhidas. **Nenhuma escolhida quer dizer todas**, e
 * não nenhuma: o estado de repouso da barra é "sem filtro", e um filtro que
 * começa escondendo a inbox inteira só ensina a recepção a desconfiar dele.
 */
export function filtrarPorBandeira<T extends { interesse: ConversaInteresse }>(
  conversas: T[],
  bandeiras: ConversaInteresse[],
): T[] {
  if (bandeiras.length === 0) return conversas;
  return conversas.filter((c) => bandeiras.includes(c.interesse));
}

/**
 * Quantas conversas em cada bandeira.
 *
 * Recebe a lista **antes** do filtro de bandeira de propósito: se contasse
 * depois, escolher uma bandeira zeraria o número de todas as outras e a barra
 * deixaria de dizer o que ainda há para ver.
 */
export function contarBandeiras(
  conversas: { interesse: ConversaInteresse }[],
): Record<ConversaInteresse, number> {
  const total = {
    nao_classificado: 0,
    com_interesse: 0,
    sem_interesse: 0,
    perdido: 0,
    convertido: 0,
  } satisfies Record<ConversaInteresse, number>;
  for (const c of conversas) total[c.interesse] += 1;
  return total;
}

/**
 * Recorta o texto em volta da palavra achada. Mostrar a mensagem inteira
 * empurraria a lista para baixo; mostrar só o começo esconderia justamente o
 * pedaço que a pessoa procurou.
 */
export function trechoAoRedor(texto: string, termo: string, janela = 80): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const i = normalizar(limpo).indexOf(normalizar(termo));
  if (i < 0 || limpo.length <= janela) return limpo;

  const meio = Math.floor((janela - termo.length) / 2);
  const inicio = Math.max(0, i - meio);
  const fim = Math.min(limpo.length, inicio + janela);
  return `${inicio > 0 ? "…" : ""}${limpo.slice(inicio, fim)}${fim < limpo.length ? "…" : ""}`;
}
