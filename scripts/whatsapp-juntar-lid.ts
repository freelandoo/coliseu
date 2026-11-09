/**
 * Junta as conversas "sem número" (@lid) na conversa do telefone — ver
 * `src/lib/whatsapp/juntar-lid.ts`. A conferência de 5 em 5 min já faz isso
 * sozinha; o script serve para ver/forçar na hora.
 *
 * Uso:
 *   npx tsx scripts/whatsapp-juntar-lid.ts            → só mostra
 *   npx tsx scripts/whatsapp-juntar-lid.ts --aplicar  → junta
 */
import { prisma } from "@/lib/db";
import { juntarConversasLid } from "@/lib/whatsapp/juntar-lid";

const APLICAR = process.argv.includes("--aplicar");

juntarConversasLid(APLICAR, console.log)
  .then((r) =>
    console.log(`${r.juntadas} com telefone conhecido, ${r.semTelefone} sem.${APLICAR ? "" : " (simulação)"}`),
  )
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
