/**
 * Leitura do payload do webhook da Evolution (formato Baileys).
 *
 * Módulo puro: não toca banco nem rede, para ser testável e para deixar
 * explícito que interpretar mensagem **não** implica responder mensagem.
 */

export type TipoMidia = "texto" | "imagem" | "audio" | "video" | "documento" | "outro";

export interface MensagemRecebida {
  waMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  /** Nome do perfil de quem escreveu — em grupo, do participante, não do grupo. */
  pushName: string;
  /** JID de quem escreveu dentro do grupo; vazio em conversa 1:1. */
  participante: string;
  texto: string;
  tipoMidia: TipoMidia;
  enviadaEm: Date;
}

/** Estrutura mínima que consumimos do evento `messages.upsert`. */
interface WebhookMensagemBruta {
  key?: {
    id?: string;
    remoteJid?: string;
    remoteJidAlt?: string;
    fromMe?: boolean;
    participant?: string;
    participantAlt?: string;
  };
  pushName?: string;
  messageTimestamp?: number | string;
  message?: Record<string, unknown> | null;
}

interface ComTexto {
  text?: string;
  caption?: string;
  selectedButtonId?: string;
  selectedDisplayText?: string;
}

function textoDe(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (valor && typeof valor === "object") {
    const o = valor as ComTexto;
    return String(o.text ?? o.caption ?? o.selectedDisplayText ?? "").trim();
  }
  return "";
}

/**
 * Rótulo do histórico quando a mídia não tem legenda. O binário não é gravado:
 * a recepção vê a foto ou ouve o áudio sob demanda, direto da Evolution.
 * O painel usa esta mesma tabela para saber que o texto é rótulo, não legenda.
 */
export const ROTULO_MIDIA: Record<Exclude<TipoMidia, "texto">, string> = {
  imagem: "📷 Imagem",
  audio: "🎤 Áudio",
  video: "🎬 Vídeo",
  documento: "📎 Documento",
  outro: "Mensagem não suportada",
};

function classificar(message: Record<string, unknown>): { tipo: TipoMidia; legenda: string } {
  if (message.imageMessage) return { tipo: "imagem", legenda: textoDe(message.imageMessage) };
  if (message.stickerMessage) return { tipo: "imagem", legenda: "" };
  if (message.audioMessage) return { tipo: "audio", legenda: "" };
  if (message.videoMessage) return { tipo: "video", legenda: textoDe(message.videoMessage) };
  if (message.documentMessage) return { tipo: "documento", legenda: textoDe(message.documentMessage) };
  return { tipo: "texto", legenda: "" };
}

/** Timestamp do WhatsApp vem em segundos; ausente ou inválido cai para agora. */
function instante(valor: number | string | undefined): Date {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return new Date();
  return new Date(n * 1000);
}

/**
 * Traduz um item de `messages.upsert` no que persistimos.
 * Devolve `null` quando não há nada aproveitável (sem id, sem JID, sem conteúdo).
 */
export function lerMensagem(bruta: unknown): MensagemRecebida | null {
  const msg = (bruta ?? {}) as WebhookMensagemBruta;
  const waMessageId = String(msg.key?.id ?? "").trim();
  // remoteJidAlt traz o JID de telefone quando o principal é @lid. Em grupo o
  // JID do grupo é o endereço da conversa: o alt (se vier) é do participante.
  const jid = String(msg.key?.remoteJid ?? "").trim();
  const remoteJid = /@g\.us$/i.test(jid) ? jid : String(msg.key?.remoteJidAlt || jid).trim();
  if (!waMessageId || !remoteJid) return null;

  const message = msg.message;
  if (!message) return null;

  const textoDireto =
    textoDe(message.conversation) ||
    textoDe(message.extendedTextMessage) ||
    textoDe(message.buttonsResponseMessage) ||
    textoDe((message.listResponseMessage as { title?: string } | undefined)?.title);

  const { tipo, legenda } = classificar(message);
  const texto = tipo === "texto" ? textoDireto : legenda || textoDireto || ROTULO_MIDIA[tipo];

  // Mídia sem legenda ainda vale registro; texto vazio sem mídia, não.
  if (!texto) return null;

  return {
    waMessageId,
    remoteJid,
    fromMe: !!msg.key?.fromMe,
    pushName: String(msg.pushName ?? "").trim(),
    // Em grupo o autor vem à parte; `participantAlt` traz o telefone quando o
    // principal é @lid, mesma lógica do remoteJid.
    participante: String(msg.key?.participantAlt || msg.key?.participant || "").trim(),
    texto,
    tipoMidia: tipo,
    enviadaEm: instante(msg.messageTimestamp),
  };
}

/** A Evolution manda ora `data.messages[]`, ora `data` direto. */
export function mensagensDoEvento(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const d = (data ?? {}) as { messages?: unknown };
  if (Array.isArray(d.messages)) return d.messages;
  return data ? [data] : [];
}

/** Estado bruto do `connection.update` normalizado. */
export function conexaoAberta(estado: unknown): boolean {
  return ["open", "connected", "connection_open"].includes(String(estado ?? "").toLowerCase());
}
