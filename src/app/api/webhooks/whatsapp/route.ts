import { NextResponse } from "next/server";
import { processarEventoWhatsapp, resumoParaLog, type EventoWebhook } from "@/lib/whatsapp/ingest";

/**
 * Webhook da Evolution API. Só grava — nunca responde ao lead.
 * Mesmo contrato de segurança do webhook do Asaas: em produção sem secret
 * configurado a rota se recusa a funcionar (503) em vez de aceitar qualquer um.
 */
export async function POST(req: Request) {
  const esperado = (process.env.WHATSAPP_WEBHOOK_SECRET ?? "").trim();
  if (process.env.NODE_ENV === "production" && !esperado) {
    return NextResponse.json({ erro: "webhook secret não configurado" }, { status: 503 });
  }
  if (esperado && req.headers.get("x-webhook-secret") !== esperado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const evento = (await req.json().catch(() => null)) as EventoWebhook | null;
  if (!evento) return NextResponse.json({ recebido: true, ignorado: "corpo inválido" });

  try {
    const r = await processarEventoWhatsapp(evento);
    return NextResponse.json({ recebido: true, ...r });
  } catch (e) {
    // A Evolution reentrega em erro; o unique de waMessageId torna isso seguro.
    console.error("[whatsapp] falha ao processar webhook", resumoParaLog(evento), e);
    return NextResponse.json({ recebido: true, erro: "falha ao processar" }, { status: 500 });
  }
}
