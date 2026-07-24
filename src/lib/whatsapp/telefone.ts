/**
 * Normalização de telefone e casamento com cadastros existentes.
 *
 * O WhatsApp entrega o número em formatos variados (com DDI 55, com ou sem o 9º
 * dígito do celular) e o CRM guarda o que a recepção digitou — "(11) 90000-0000",
 * "11900000000", "5511900000000". Comparar strings cruas duplica cadastro.
 * A chave de comparação são os **últimos 8 dígitos**: sobrevive ao DDI e ao 9º
 * dígito, e ainda carrega o final do DDD implicitamente na prática brasileira.
 */

export function soDigitos(valor: string | null | undefined): string {
  return String(valor ?? "").replace(/\D/g, "");
}

/** Chave de casamento entre um número do WhatsApp e um telefone do cadastro. */
export function chaveTelefone(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  return d.length >= 8 ? d.slice(-8) : "";
}

/** JID de grupo — `120363...@g.us`. Conversa coletiva, nunca um cadastro. */
export function ehJidGrupo(remoteJid: string | null | undefined): boolean {
  return /@g\.us$/i.test(String(remoteJid ?? "").trim());
}

/** JIDs que não são conversa 1:1 com uma pessoa — grupo, transmissão, status. */
export function ehConversaPessoal(remoteJid: string | null | undefined): boolean {
  const jid = String(remoteJid ?? "").trim();
  if (!jid) return false;
  if (ehJidGrupo(jid)) return false;
  if (/@broadcast$/i.test(jid)) return false;
  if (/^status@/i.test(jid)) return false;
  return true;
}

/**
 * JIDs que viram conversa no Atendimento: pessoa **ou** grupo. Transmissão e
 * status ficam de fora — não são conversa, são publicação de mão única.
 */
export function ehConversaAtendivel(remoteJid: string | null | undefined): boolean {
  return ehJidGrupo(remoteJid) || ehConversaPessoal(remoteJid);
}

/**
 * Extrai o telefone de um JID. `@lid` é um identificador opaco que o WhatsApp
 * usa quando não expõe o número — devolve vazio, e a conversa fica sem telefone
 * até a recepção completar o cadastro. Grupo também: o `120363…` do JID é um id
 * de grupo com cara de telefone, e tratá-lo como número criaria cadastro fantasma.
 */
export function telefoneDoJid(remoteJid: string | null | undefined): string {
  const jid = String(remoteJid ?? "").trim();
  if (!jid || /@lid$/i.test(jid) || ehJidGrupo(jid)) return "";
  const [parte] = jid.split("@");
  const d = soDigitos(parte);
  return d.length >= 10 ? d : "";
}

/** Formato de exibição: (11) 90000-0000, tolerando DDI e números curtos. */
export function formatarTelefone(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  const nacional = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return nacional || "";
}

/** Telefone em log nunca aparece inteiro (LGPD). */
export function redigirTelefone(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  return d.length <= 4 ? "****" : `****${d.slice(-4)}`;
}
