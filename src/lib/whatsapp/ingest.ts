/**
 * Ingestão do webhook da Evolution.
 *
 * INVARIANTE DO SUBSISTEMA: este módulo **não importa** `@/lib/whatsapp/evolution`
 * — o único lugar que envia mensagem. Não há caminho de código daqui até um
 * `sendText`, então o WhatsApp nunca responde sozinho. Há teste garantindo isso;
 * se um dia precisar chamar a Evolution na ingestão, mude o teste conscientemente.
 */

import {
  atualizarStatusInstanciaRepo,
  citacaoPorWaIdRepo,
  acharConversaRepo,
  garantirConversaRepo,
  instanciaAtualRepo,
  instanciaPorNomeRepo,
  registrarMensagemRepo,
} from "@/lib/repositories/whatsapp";
import { conexaoAberta, lerMensagem, mensagensDoEvento } from "@/lib/whatsapp/payload";
import {
  ehConversaAtendivel,
  ehJidGrupo,
  formatarTelefone,
  redigirTelefone,
  telefoneDoJid,
} from "@/lib/whatsapp/telefone";

export interface EventoWebhook {
  event?: string;
  instance?: string;
  data?: unknown;
}

export type ResultadoIngestao =
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "conexao"; conectado: boolean }
  | { tipo: "mensagens"; gravadas: number; duplicadas: number };

/**
 * `connection.update` — mantém o status da instância em dia sem polling.
 *
 * A Evolution emite este evento também com `connecting` durante o handshake e a
 * reconexão. Tratar tudo que não é `open` como DISCONNECTED marcava a instância
 * como caída no meio de uma sessão saudável, e o status ficava grudado assim —
 * o botão voltava para "Conectar WhatsApp" com o WhatsApp funcionando. Só
 * `close` derruba de fato; `connecting` é estado de passagem.
 */
async function tratarConexao(evento: EventoWebhook): Promise<ResultadoIngestao> {
  const d = (evento.data ?? {}) as { state?: unknown; statusReason?: unknown; wuid?: unknown };
  const conectado = conexaoAberta(d.state);
  const estado = String(d.state ?? "").toLowerCase();
  const instancia = evento.instance;

  if (instancia && (conectado || estado === "close")) {
    const numero = typeof d.wuid === "string" ? d.wuid.split("@")[0] : undefined;
    await atualizarStatusInstanciaRepo(
      instancia,
      conectado ? "CONNECTED" : "DISCONNECTED",
      conectado ? (numero ?? undefined) : null,
    );
  }
  return { tipo: "conexao", conectado };
}

/**
 * Quem escreveu dentro do grupo. O nome de perfil é o melhor rótulo; sem ele
 * sobra o telefone do participante, e sem os dois a bolha fica sem assinatura
 * em vez de mentir um nome.
 */
function remetenteDaMensagem(msg: { pushName: string; participante: string }): string | null {
  return msg.pushName || formatarTelefone(telefoneDoJid(msg.participante)) || null;
}

/**
 * Processa um evento. Nunca lança por conteúdo inesperado: devolve `ignorado`.
 * Erro real (banco fora) sobe para o caller logar.
 */
export async function processarEventoWhatsapp(evento: EventoWebhook): Promise<ResultadoIngestao> {
  const tipo = String(evento.event ?? "").toLowerCase();

  if (tipo === "connection.update") return tratarConexao(evento);
  if (tipo !== "messages.upsert") return { tipo: "ignorado", motivo: `evento ${tipo || "vazio"}` };

  // A instância vem no evento; a mais antiga é só o recuo para evento sem nome.
  const instancia =
    (evento.instance ? await instanciaPorNomeRepo(evento.instance) : null) ?? (await instanciaAtualRepo());
  if (!instancia) return { tipo: "ignorado", motivo: "nenhuma instância registrada" };

  const r = await ingerirMensagens(mensagensDoEvento(evento.data), instancia.id);
  return { tipo: "mensagens", gravadas: r.gravadas, duplicadas: r.duplicadas };
}

export interface OpcoesIngestao {
  /** Mensagem antiga: não conta como não lida, sem push, sem puxar a conversa para o topo. */
  historico?: boolean;
  /** Só grava em conversa que já existe — a importação de histórico não cria lead novo. */
  soConversaExistente?: boolean;
}

export interface ResultadoLote {
  gravadas: number;
  duplicadas: number;
  /** Sem conteúdo aproveitável, conversa não atendível ou (com `soConversaExistente`) sem conversa. */
  puladas: number;
}

/**
 * Grava itens no formato do `messages.upsert`. É o caminho único: webhook,
 * conferência com a Evolution e importação de histórico passam todos aqui.
 */
export async function ingerirMensagens(
  itens: unknown[],
  instanceId: string,
  opcoes: OpcoesIngestao = {},
): Promise<ResultadoLote> {
  const r: ResultadoLote = { gravadas: 0, duplicadas: 0, puladas: 0 };

  for (const bruta of itens) {
    const msg = lerMensagem(bruta);
    if (!msg || !ehConversaAtendivel(msg.remoteJid)) {
      r.puladas++;
      continue;
    }

    const grupo = ehJidGrupo(msg.remoteJid);
    const conversa = opcoes.soConversaExistente
      ? await acharConversaRepo(instanceId, msg.remoteJid)
      : await garantirConversaRepo({
          instanceId,
          remoteJid: msg.remoteJid,
          // Em grupo o pushName é de quem escreveu, não do grupo: usar isso como
          // nome da conversa faria o título trocar a cada mensagem. O assunto do
          // grupo vem da sincronização com a Evolution, fora da ingestão.
          pushName: grupo ? "" : msg.pushName,
          ehGrupo: grupo,
        });
    if (!conversa) {
      r.puladas++;
      continue;
    }

    // Respondeu citando: preferimos a nossa própria cópia da original (sabe
    // quem escreveu) e caímos na prévia que o WhatsApp mandou quando a citada é
    // anterior ao que o Coliseu guarda.
    const citada = msg.citacao
      ? ((await citacaoPorWaIdRepo(conversa.id, msg.citacao.waId)) ?? {
          waId: msg.citacao.waId,
          texto: msg.citacao.texto,
          autor: null,
        })
      : null;

    // fromMe = respondido pelo celular do dono: entra no histórico como saída
    // sem autor de sistema, para a recepção ver a conversa inteira.
    const novo = await registrarMensagemRepo({
      conversaId: conversa.id,
      waMessageId: msg.waMessageId,
      direcao: msg.fromMe ? "OUT" : "IN",
      autor: msg.fromMe ? "ATENDENTE" : "LEAD",
      remetente: grupo ? remetenteDaMensagem(msg) : null,
      texto: msg.texto,
      tipoMidia: msg.tipoMidia,
      enviadaEm: msg.enviadaEm,
      citada,
      historico: opcoes.historico,
    });

    if (novo) r.gravadas++;
    else r.duplicadas++;
  }

  return r;
}

/** Log de webhook sem vazar telefone completo (LGPD). */
export function resumoParaLog(evento: EventoWebhook): Record<string, string> {
  const primeira = mensagensDoEvento(evento.data)[0];
  const msg = primeira ? lerMensagem(primeira) : null;
  return {
    evento: String(evento.event ?? ""),
    instancia: String(evento.instance ?? ""),
    numero: msg ? redigirTelefone(msg.remoteJid.split("@")[0]) : "",
  };
}
