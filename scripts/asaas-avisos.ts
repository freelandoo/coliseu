/**
 * Aplica os avisos da academia (`ajustesDeAviso`) a todos os clientes do
 * Asaas que o Coliseu conhece (BillingCustomer com id real). Cliente novo já
 * nasce configurado; este script cobre os que existiam antes (26/10/2026).
 *
 * A chave de produção começa com "$aact": passe as envs direto, sem .env do
 * Next (o @next/env expande o "$" e zera a chave).
 *
 *   ASAAS_API_KEY=... ASAAS_ENV=production DATABASE_URL=... npx tsx scripts/asaas-avisos.ts
 */
import { PrismaClient } from "@prisma/client";
import { configurarAvisosAsaas, ehIdAsaasReal } from "../src/lib/asaas";

async function main() {
  const prisma = new PrismaClient();
  const clientes = (await prisma.billingCustomer.findMany({ select: { asaasCustomerId: true } }))
    .map((c) => c.asaasCustomerId)
    .filter((id) => ehIdAsaasReal(id));
  let mudados = 0;
  let avisos = 0;
  let falhas = 0;
  for (const id of clientes) {
    try {
      const n = await configurarAvisosAsaas(id);
      if (n) mudados++;
      avisos += n;
    } catch (e) {
      falhas++;
      console.error(id, e instanceof Error ? e.message : e);
    }
  }
  console.log(`${clientes.length} cliente(s) no Asaas · ${mudados} ajustado(s) · ${avisos} aviso(s) desligado(s) · ${falhas} falha(s)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
