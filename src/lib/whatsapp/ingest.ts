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
  garantirConversaRepo,
  instanciaAtualRepo,
  registrarMensagemRepo,
} from "@/lib/repositories/whatsapp";
import { conexaoAberta, lerMensagem, mensagensDoEvento } from "@/lib/whatsapp/payload";
import { ehConversaPessoal, redigirTelefone } from "@/lib/whatsapp/telefone";

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
 * Processa um evento. Nunca lança por conteúdo inesperado: devolve `ignorado`.
 * Erro real (banco fora) sobe para o caller logar.
 */
export async function processarEventoWhatsapp(evento: EventoWebhook): Promise<ResultadoIngestao> {
  const tipo = String(evento.event ?? "").toLowerCase();

  if (tipo === "connection.update") return tratarConexao(evento);
  if (tipo !== "messages.upsert") return { tipo: "ignorado", motivo: `evento ${tipo || "vazio"}` };

  const instancia = await instanciaAtualRepo();
  if (!instancia) return { tipo: "ignorado", motivo: "nenhuma instância registrada" };

  let gravadas = 0;
  let duplicadas = 0;

  for (const bruta of mensagensDoEvento(evento.data)) {
    const msg = lerMensagem(bruta);
    if (!msg) continue;
    if (!ehConversaPessoal(msg.remoteJid)) continue;

    const conversa = await garantirConversaRepo({
      instanceId: instancia.id,
      remoteJid: msg.remoteJid,
      pushName: msg.pushName,
    });

    // fromMe = respondido pelo celular do dono: entra no histórico como saída
    // sem autor de sistema, para a recepção ver a conversa inteira.
    const novo = await registrarMensagemRepo({
      conversaId: conversa.id,
      waMessageId: msg.waMessageId,
      direcao: msg.fromMe ? "OUT" : "IN",
      autor: msg.fromMe ? "ATENDENTE" : "LEAD",
      texto: msg.texto,
      tipoMidia: msg.tipoMidia,
      enviadaEm: msg.enviadaEm,
    });

    if (novo) gravadas++;
    else duplicadas++;
  }

  return { tipo: "mensagens", gravadas, duplicadas };
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
