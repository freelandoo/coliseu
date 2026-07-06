import { NextResponse } from "next/server";
import { marcarCobrancaAtrasada, marcarCobrancaPaga } from "@/lib/store";

// ============================================================
// Webhook do Asaas (Estágio 2 — "Asaas confirma via webhook")
// Configurar em: Asaas → Integrações → Webhooks → URL /api/webhooks/asaas
// Eventos relevantes: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE
// ============================================================

interface AsaasWebhookBody {
  event: string;
  payment?: {
    id: string;
    customer: string;
    value: number;
    status: string;
  };
}

export async function POST(req: Request) {
  // Validação do segredo configurado no Asaas (header asaas-access-token).
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expected && req.headers.get("asaas-access-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as AsaasWebhookBody;
  const asaasId = body.payment?.id;

  switch (body.event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const ok = asaasId ? await marcarCobrancaPaga(asaasId) : false;
      console.log("[asaas] pagamento confirmado:", asaasId, "→ baixa:", ok);
      break;
    }
    case "PAYMENT_OVERDUE": {
      const ok = asaasId ? await marcarCobrancaAtrasada(asaasId) : false;
      console.log("[asaas] pagamento atrasado:", asaasId, "→ atraso:", ok);
      break;
    }
    default:
      console.log("[asaas] evento ignorado:", body.event);
  }

  return NextResponse.json({ received: true });
}
