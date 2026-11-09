/**
 * Leitura do payload do webhook da Evolution (formato Baileys).
 *
 * Módulo puro: não toca banco nem rede, para ser testável e para deixar
 * explícito que interpretar mensagem **não** implica responder mensagem.
 */

export type TipoMidia = "texto" | "imagem" | "audio" | "video" | "documento" | "outro";

/**
 * A mensagem que a recebida está respondendo — o "responder" do WhatsApp.
 * `waId` é o `key.id` da original (o `stanzaId` do contexto); `texto` é o que o
 * WhatsApp mandou junto como prévia, e pode vir vazio.
 */
export interface CitacaoRecebida {
  waId: string;
  texto: string;
}

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
  /** Preenchida só quando a pessoa respondeu citando uma mensagem. */
  citacao: CitacaoRecebida | null;
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
  outro: "Mensagem não suportada — veja no celular",
};

function classificar(message: Record<string, unknown>): { tipo: TipoMidia; legenda: string } {
  if (message.imageMessage) return { tipo: "imagem", legenda: textoDe(message.imageMessage) };
  if (message.stickerMessage) return { tipo: "imagem", legenda: "" };
  if (message.audioMessage) return { tipo: "audio", legenda: "" };
  if (message.videoMessage) return { tipo: "video", legenda: textoDe(message.videoMessage) };
  if (message.ptvMessage) return { tipo: "video", legenda: "" };
  if (message.documentMessage) return { tipo: "documento", legenda: textoDe(message.documentMessage) };
  return { tipo: "texto", legenda: "" };
}

/**
 * O texto que representa uma mensagem qualquer do Baileys — direto, legenda de
 * mídia ou o rótulo da mídia sem legenda. Serve à mensagem recebida e à citada,
 * que tem exatamente a mesma forma.
 */
function conteudoDe(message: Record<string, unknown>): { texto: string; tipoMidia: TipoMidia } {
  const m = desembrulhar(message);
  const direto =
    textoDe(m.conversation) ||
    textoDe(m.extendedTextMessage) ||
    textoDe(m.buttonsResponseMessage) ||
    textoDe(m.templateButtonReplyMessage) ||
    textoDe((m.listResponseMessage as { title?: string } | undefined)?.title) ||
    textoDe((m.interactiveResponseMessage as { body?: unknown } | undefined)?.body) ||
    textoEspecial(m);

  const { tipo, legenda } = classificar(m);
  if (tipo !== "texto") return { texto: legenda || direto || ROTULO_MIDIA[tipo], tipoMidia: tipo };
  if (direto) return { texto: direto, tipoMidia: "texto" };
  // Nada reconhecido: o que é ruído de protocolo some; o resto entra como
  // "não suportada" para a recepção saber que a pessoa mandou algo e abrir no
  // celular — descartar em silêncio é que não pode.
  if (ehSoProtocolo(m)) return { texto: "", tipoMidia: "texto" };
  return { texto: ROTULO_MIDIA.outro, tipoMidia: "outro" };
}

/**
 * Envelopes do Baileys: a mensagem de verdade vem dentro de `.message`.
 * Mensagem temporária, visualização única, documento com legenda e a foto de
 * um álbum chegam assim. Profundidade limitada — envelope dentro de envelope
 * existe, loop infinito não.
 */
const ENVELOPES = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "associatedChildMessage",
  "groupMentionedMessage",
  "botInvokeMessage",
  "lottieStickerMessage",
  "deviceSentMessage",
] as const;

function desembrulhar(message: Record<string, unknown>): Record<string, unknown> {
  let atual = message;
  for (let i = 0; i < 4; i++) {
    const envelope = ENVELOPES.map((k) => atual[k] as { message?: unknown } | undefined).find(
      (v) => v && typeof v === "object" && v.message && typeof v.message === "object",
    );
    if (!envelope) return atual;
    atual = envelope.message as Record<string, unknown>;
  }
  return atual;
}

/**
 * Conteúdo que não é texto nem mídia baixável, mas que a pessoa vê no
 * WhatsApp: contato, localização, enquete, evento, botões de empresa. Vira um
 * texto legível — o original continua no celular.
 */
function textoEspecial(m: Record<string, unknown>): string {
  const o = (k: string) => (m[k] && typeof m[k] === "object" ? (m[k] as Record<string, unknown>) : null);
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const contato = o("contactMessage");
  if (contato) return `👤 Contato: ${s(contato.displayName) || "sem nome"}`;
  const contatos = o("contactsArrayMessage");
  if (contatos) {
    const nomes = Array.isArray(contatos.contacts)
      ? (contatos.contacts as { displayName?: unknown }[]).map((c) => s(c.displayName)).filter(Boolean)
      : [];
    return `👤 Contatos: ${nomes.join(", ") || s(contatos.displayName) || "sem nome"}`;
  }
  const local = o("locationMessage") ?? o("liveLocationMessage");
  if (local) {
    const onde = [s(local.name), s(local.address)].filter(Boolean).join(" — ");
    return `📍 Localização${onde ? `: ${onde}` : ""}`;
  }
  const enquete = o("pollCreationMessage") ?? o("pollCreationMessageV2") ?? o("pollCreationMessageV3");
  if (enquete) return `📊 Enquete: ${s(enquete.name)}`;
  const evento = o("eventMessage");
  if (evento) return `📅 Evento: ${s(evento.name)}`;

  const botoes = o("buttonsMessage");
  if (botoes) return s(botoes.contentText) || s(botoes.text);
  const interativa = o("interactiveMessage");
  if (interativa) return textoDe(interativa.body);
  const lista = o("listMessage");
  if (lista) return s(lista.description) || s(lista.title);
  const modelo = o("templateMessage");
  if (modelo) {
    const h = (modelo.hydratedTemplate ?? modelo.hydratedFourRowTemplate) as Record<string, unknown> | undefined;
    return s(h?.hydratedContentText) || s(h?.hydratedTitleText);
  }
  return "";
}

/**
 * Mensagens que não são conversa: reação, edição/apagamento, fixar, aviso de
 * álbum (as fotos chegam uma a uma), voto cifrado, troca de chaves. Ninguém
 * precisa ver "mensagem não suportada" por causa delas.
 */
const SO_PROTOCOLO = new Set([
  "reactionMessage",
  "encReactionMessage",
  "protocolMessage",
  "secretEncryptedMessage",
  "pinInChatMessage",
  "keepInChatMessage",
  "albumMessage",
  "pollUpdateMessage",
  "encEventResponseMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "deviceSentMessage",
  "editedMessage",
  "messageHistoryBundle",
  "messageHistoryNotice",
  // Texto que veio vazio (só espaços) não é "não suportada": é nada.
  "conversation",
  "extendedTextMessage",
]);

function ehSoProtocolo(m: Record<string, unknown>): boolean {
  const chaves = Object.keys(m).filter((k) => m[k] != null);
  return chaves.length === 0 || chaves.every((k) => SO_PROTOCOLO.has(k));
}

/**
 * O `contextInfo` fica dentro do nó da mensagem (`extendedTextMessage`,
 * `imageMessage`…), e não num lugar fixo — por isso a varredura. Só interessa o
 * que tem `stanzaId`: é ele que identifica a mensagem citada.
 */
function citacaoDe(message: Record<string, unknown>): CitacaoRecebida | null {
  for (const valor of Object.values(message)) {
    if (!valor || typeof valor !== "object") continue;
    const ctx = (valor as { contextInfo?: unknown }).contextInfo as
      | { stanzaId?: unknown; quotedMessage?: unknown }
      | undefined;
    const waId = String(ctx?.stanzaId ?? "").trim();
    if (!waId) continue;

    const citada = ctx?.quotedMessage;
    const texto =
      citada && typeof citada === "object"
        ? conteudoDe(citada as Record<string, unknown>).texto
        : "";
    return { waId, texto };
  }
  return null;
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

  const { texto, tipoMidia } = conteudoDe(message);

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
    tipoMidia,
    enviadaEm: instante(msg.messageTimestamp),
    citacao: citacaoDe(message),
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
