import { randomUUID } from "node:crypto";
import {
  assumirConversaRepo,
  dadosEnvioConversaRepo,
  registrarMensagemRepo,
  type CitacaoGravada,
} from "@/lib/repositories/whatsapp";
import {
  configEvolution,
  enviarTexto,
  EvolutionError,
  type ConfigEvolution,
} from "@/lib/whatsapp/evolution";

/**
 * Envio de mensagem pela aplicação, num lugar só.
 *
 * Continua valendo a promessa de que ninguém é respondido automaticamente: este
 * módulo só é alcançável a partir de rota com sessão, ou seja, sempre atrás de
 * um clique de quem atende (ver `sem-automacao.test.ts`, que garante que a
 * ingestão do webhook não chega até aqui).
 */

export type FalhaEnvio = { erro: string; status: number };

export function ehFalhaEnvio(x: unknown): x is FalhaEnvio {
  return typeof x === "object" && x !== null && "erro" in x && "status" in x;
}

export const LIMITE_TEXTO = 4096; // limite prático de uma mensagem de texto do WhatsApp

interface ContextoEnvio {
  cfg: ConfigEvolution;
  instancia: string;
  /** Grupo se endereça pelo JID; pessoa, pelo telefone. */
  destino: string;
  /** Quem responde primeiro assume o atendimento. */
  assumir: () => Promise<void>;
}

/**
 * Tudo que precisa estar de pé antes de falar com a Evolution. Devolve a falha
 * já com o status HTTP que a rota deve responder.
 */
export async function contextoEnvio(
  conversaId: string,
  userId: string,
): Promise<ContextoEnvio | FalhaEnvio> {
  const cfg = configEvolution();
  if (!cfg) return { erro: "WhatsApp não configurado.", status: 503 };

  const conversa = await dadosEnvioConversaRepo(conversaId);
  if (!conversa) return { erro: "conversa não encontrada", status: 404 };
  if (conversa.instance.status !== "CONNECTED") {
    return { erro: "WhatsApp desconectado. Conecte antes de responder.", status: 409 };
  }

  const destino = conversa.ehGrupo ? conversa.remoteJid : conversa.telefone;
  if (!destino) {
    return { erro: "Esta conversa não expõe o número; responda pelo aparelho.", status: 409 };
  }

  return {
    cfg,
    instancia: conversa.instance.evolutionInstance,
    destino,
    assumir: async () => {
      if (!conversa.atendenteId) await assumirConversaRepo(conversaId, userId).catch(() => undefined);
    },
  };
}

/**
 * Manda o texto e guarda a bolha. Falha de envio não perde a mensagem: fica
 * registrada com o erro, para a conversa mostrar o que não saiu.
 */
export async function enviarTextoNaConversa(input: {
  conversaId: string;
  texto: string;
  userId: string;
  /** Contexto já resolvido pela rota; sem ele, resolve aqui. */
  contexto?: ContextoEnvio;
  /** Mensagem citada, quando a recepção respondeu uma em especial. */
  citada?: CitacaoGravada | null;
}): Promise<null | FalhaEnvio> {
  const ctx = input.contexto ?? (await contextoEnvio(input.conversaId, input.userId));
  if (ehFalhaEnvio(ctx)) return ctx;

  await ctx.assumir();
  try {
    const waId = await enviarTexto(
      ctx.cfg,
      ctx.instancia,
      ctx.destino,
      input.texto,
      input.citada && { waId: input.citada.waId, texto: input.citada.texto },
    );
    // Sem id do WhatsApp não há como deduplicar o eco do webhook; o prefixo
    // "local:" deixa isso explícito no banco.
    await registrarMensagemRepo({
      conversaId: input.conversaId,
      waMessageId: waId ?? `local:${randomUUID()}`,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorUserId: input.userId,
      texto: input.texto,
      citada: input.citada,
    });
    return null;
  } catch (e) {
    await registrarMensagemRepo({
      conversaId: input.conversaId,
      waMessageId: `local:${randomUUID()}`,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorUserId: input.userId,
      texto: input.texto,
      citada: input.citada,
      erro: e instanceof Error ? e.message.slice(0, 200) : "falha no envio",
    }).catch(() => undefined);

    if (e instanceof EvolutionError) return { erro: e.message, status: e.status };
    console.error("[whatsapp] falha ao enviar", e);
    return { erro: "Falha ao enviar a mensagem.", status: 502 };
  }
}
