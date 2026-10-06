import { NextResponse } from "next/server";
import { registrarWebhookEvent, marcarEventoProcessado, marcarEventoFalho } from "@/lib/billing/webhook-store";
import { processarEvento, type AsaasEvent } from "@/lib/billing/processor";

export async function POST(req: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json({ error: "webhook token not configured" }, { status: 503 });
  }
  if (expected && req.headers.get("asaas-access-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as AsaasEvent;
  const alvo = body.payment?.id ?? body.subscription?.id ?? "none";
  const asaasEventId = body.id ?? `${body.event}:${alvo}:${body.dateCreated ?? ""}`;

  const { created, event } = await registrarWebhookEvent(asaasEventId, body);
  if (!created) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await processarEvento(body);
    await marcarEventoProcessado(event.id);
  } catch (e) {
    await marcarEventoFalho(event.id, e instanceof Error ? e.message : String(e));
  }

  return NextResponse.json({ received: true });
}
