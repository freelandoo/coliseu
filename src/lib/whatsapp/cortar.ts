/**
 * Corta o texto em `max` unidades sem partir um emoji ao meio.
 *
 * `String.slice` conta unidades UTF-16: um emoji ocupa duas, e o corte bem no
 * meio deixa meio caractere solto. O Prisma recusa esse texto ("unexpected end
 * of hex escape") e a gravação inteira falha — no webhook isso virava 500 e a
 * mensagem se perdia depois das novas tentativas da Evolution.
 */
export function cortarTexto(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max);
  const ultimo = corte.charCodeAt(corte.length - 1);
  // Metade alta de um par (0xD800–0xDBFF) sem a metade baixa: descarta.
  return ultimo >= 0xd800 && ultimo <= 0xdbff ? corte.slice(0, -1) : corte;
}
