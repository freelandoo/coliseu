/**
 * Assinatura da recepção no corpo da mensagem.
 *
 * Quem recebe no WhatsApp precisa saber com quem está falando — o número é o da
 * academia, não o da pessoa que atende. Por isso toda resposta sai com o
 * primeiro nome de quem escreveu na frente.
 *
 * A assinatura **não** passa pela caixa de texto: ela é colada aqui, no
 * servidor, na hora de enviar. Assim ninguém apaga a própria assinatura sem
 * querer (nem de propósito), e a recepção escreve só o que quer dizer.
 *
 * Os asteriscos são a marcação de negrito do WhatsApp: no celular do cliente,
 * "Alex:" aparece destacado do resto da mensagem.
 *
 * Módulo puro: não toca banco nem rede, para ser testável dos dois lados — o
 * servidor assina de verdade, e o painel usa o mesmo cálculo só para mostrar a
 * bolha otimista já assinada, sem piscar.
 */

/** "alex.rodriguus" → "Alex". Login sem ponto vale inteiro. */
export function nomeAssinatura(login: string): string {
  const bruto = String(login ?? "").trim();
  const primeiro = bruto.split(".")[0] || bruto;
  if (!primeiro) return "";
  return `${primeiro.charAt(0).toUpperCase()}${primeiro.slice(1).toLowerCase()}`;
}

/** O que entra na frente da mensagem, com o espaço: `*Alex:* `. */
export function prefixoAssinatura(login: string): string {
  const nome = nomeAssinatura(login);
  return nome ? `*${nome}:* ` : "";
}

/**
 * Assina o texto. Idempotente de propósito: mensagem que já vem assinada — texto
 * colado de outra conversa, reenvio, resposta pronta cadastrada com o nome —
 * não ganha a assinatura duas vezes.
 *
 * Texto vazio continua vazio: assinatura sozinha não é mensagem, e quem valida
 * o "não pode ir em branco" é a rota.
 */
export function assinar(texto: string, login: string): string {
  const corpo = String(texto ?? "").trim();
  if (!corpo) return "";
  const prefixo = prefixoAssinatura(login);
  if (!prefixo) return corpo;
  return corpo.startsWith(prefixo.trimEnd()) ? corpo : prefixo + corpo;
}
