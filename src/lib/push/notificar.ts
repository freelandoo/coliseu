/**
 * Aviso de mensagem nova no celular via Web Push (PWA).
 *
 * Chamado pela gravação de mensagem recebida — fire-and-forget: falha de push
 * nunca pode derrubar a ingestão do webhook. Sem as chaves VAPID no ambiente,
 * tudo aqui vira no-op (dev e testes rodam sem configurar nada).
 *
 * INVARIANTE: não importa `@/lib/whatsapp/evolution`. Avisar o atendente não é
 * responder o lead — a ingestão continua sem alcançar o envio (teste de
 * arquitetura garante).
 */

import webpush from "web-push";
import { prisma } from "@/lib/db";
import { formatarTelefone } from "@/lib/whatsapp/telefone";
import {
  apagarInscricaoPorEndpointRepo,
  listarInscricoesAtendimentoRepo,
} from "@/lib/repositories/push";

/** Um aviso por conversa a cada janela: rajada de mensagens não vira metralhadora. */
const JANELA_POR_CONVERSA_MS = 45_000;

// Sobrevive ao HMR do dev; em produção o processo é único (ver eventos.ts).
const g = globalThis as unknown as { __coliseuPushJanela?: Map<string, number> };
const ultimoAviso = g.__coliseuPushJanela ?? new Map<string, number>();
if (!g.__coliseuPushJanela) g.__coliseuPushJanela = ultimoAviso;

function vapid() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return null;
  const subject = (process.env.VAPID_SUBJECT ?? "").trim() || "mailto:freelandoogroup@gmail.com";
  return { publicKey, privateKey, subject };
}

/** Chave pública para o navegador assinar a inscrição; null = push desligado. */
export function chavePublicaPush(): string | null {
  return vapid()?.publicKey ?? null;
}

/**
 * Notifica os aparelhos de quem atende sobre mensagem recebida na conversa.
 * Grupo não avisa: fala demais, e lead é quem move o funil.
 */
export async function notificarMensagemRecebida(conversaId: string): Promise<void> {
  const cfg = vapid();
  if (!cfg) return;

  const agora = Date.now();
  const ultimo = ultimoAviso.get(conversaId) ?? 0;
  if (agora - ultimo < JANELA_POR_CONVERSA_MS) return;
  ultimoAviso.set(conversaId, agora);

  const conversa = await prisma.conversa.findUnique({
    where: { id: conversaId },
    select: {
      ehGrupo: true,
      pushName: true,
      telefone: true,
      ultimaMensagemPreview: true,
      person: { select: { nome: true } },
    },
  });
  if (!conversa || conversa.ehGrupo) return;

  const inscricoes = await listarInscricoesAtendimentoRepo();
  if (inscricoes.length === 0) return;

  // Mesma regra de rótulo do inbox: cadastro > nome de perfil > telefone.
  const nome =
    conversa.person?.nome || conversa.pushName || formatarTelefone(conversa.telefone);

  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  const payload = JSON.stringify({
    titulo: nome || "Mensagem nova",
    corpo: conversa.ultimaMensagemPreview || "Nova mensagem no WhatsApp",
    url: `/captacao/atendimento?c=${conversaId}`,
    // Mesma tag = a notificação seguinte substitui a anterior da conversa.
    tag: `conversa:${conversaId}`,
  });

  await Promise.allSettled(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          payload,
          { TTL: 60 * 60 },
        );
      } catch (e) {
        // 404/410 = inscrição morta (app desinstalado, permissão revogada).
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await apagarInscricaoPorEndpointRepo(i.endpoint);
        else console.error("[push] falha ao notificar aparelho", status ?? e);
      }
    }),
  );
}
