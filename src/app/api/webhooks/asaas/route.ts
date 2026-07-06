import { NextResponse } from "next/server";
import { registrarWebhookEvent, marcarEventoProcessado, marcarEventoFalho } from "@/lib/billing/webhook-store";
import { processarEvento } from "@/lib/billing/processor";

interface AsaasWebhookBody {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: { id: string; status?: string; value?: number; dueDate?: string; paymentDate?: string; invoiceUrl?: string; subscription?: string; dateCreated?: string };
}

export async function POST(req: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json({ error: "webhook token not configured" }, { status: 503 });
  }
  if (expected && req.headers.get("asaas-access-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as AsaasWebhookBody;
  const asaasEventId = body.id ?? `${body.event}:${body.payment?.id ?? "none"}:${body.dateCreated ?? ""}`;

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
