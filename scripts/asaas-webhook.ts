/**
 * Registra (ou atualiza) o webhook do Coliseu na conta Asaas.
 *
 * Uso:
 *   npx tsx scripts/asaas-webhook.ts                       → só lista os webhooks da conta
 *   npx tsx scripts/asaas-webhook.ts --aplicar             → cria/atualiza o do Coliseu
 *   npx tsx scripts/asaas-webhook.ts --aplicar --url https://.../api/webhooks/asaas
 *
 * Lê ASAAS_API_KEY / ASAAS_ENV / ASAAS_WEBHOOK_TOKEN / PUBLIC_APP_URL do
 * .env(.local). A conta pode ter webhooks de outros sistemas: só mexe no que
 * aponta para a mesma URL, nunca nos demais.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const EVENTOS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_RESTORED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "SUBSCRIPTION_DELETED",
  "SUBSCRIPTION_INACTIVATED",
];

type Webhook = { id: string; name: string; url: string; enabled: boolean; interrupted: boolean; events: string[] };

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  const base =
    process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  const api = async <T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> => {
    const r = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", access_token: key },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const j = (await r.json()) as T & { errors?: { description: string }[] };
    if (!r.ok) throw new Error(`${metodo} ${caminho}: ${j.errors?.map((e) => e.description).join("; ") ?? r.status}`);
    return j;
  };

  console.log(`[asaas-webhook] ambiente: ${process.env.ASAAS_ENV === "production" ? "PRODUÇÃO" : "sandbox"}`);
  const { data } = await api<{ data: Webhook[] }>("GET", "/webhooks");
  for (const w of data) {
    console.log(`  - ${w.name} → ${w.url} (${w.enabled ? "ativo" : "desligado"}${w.interrupted ? ", FILA PAUSADA" : ""})`);
  }
  if (!process.argv.includes("--aplicar")) return;

  const publico = (process.env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const url = arg("--url") ?? (publico && `${publico}/api/webhooks/asaas`);
  if (!url) throw new Error("informe --url ou PUBLIC_APP_URL");
  const authToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!authToken) throw new Error("ASAAS_WEBHOOK_TOKEN não configurado — o webhook ficaria aberto");

  const corpo = {
    name: "coliseu",
    url,
    email: process.env.ASAAS_WEBHOOK_EMAIL || undefined,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken,
    sendType: "SEQUENTIALLY",
    events: EVENTOS,
  };
  const atual = data.find((w) => w.url === url);
  if (atual) {
    await api("PUT", `/webhooks/${atual.id}`, corpo);
    console.log(`[asaas-webhook] atualizado: ${url}`);
  } else {
    await api("POST", "/webhooks", corpo);
    console.log(`[asaas-webhook] criado: ${url}`);
  }
}

main().catch((e) => {
  console.error("[asaas-webhook] falhou:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
