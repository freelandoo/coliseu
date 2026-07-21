/**
 * Adoção da migração CloudGym → Coliseu (Task 6).
 *
 * Uso:
 *   npx tsx scripts/migracao/adotar.ts                     → dry-run (não escreve)
 *   npx tsx scripts/migracao/adotar.ts --apply             → grava os ADOTAR
 *   npx tsx scripts/migracao/adotar.ts --apply --incluir-revisar
 *       → grava também os REVISAR (só depois da revisão com a recepção!)
 *   npx tsx scripts/migracao/adotar.ts --device <AccessDevice.id>
 *       → escolhe a catraca quando houver mais de uma
 *   npx tsx scripts/migracao/adotar.ts --arquivo <path.json>
 *       → lê outro fragmento de conciliação (ex.: conciliacao-19.json da revisita)
 *
 * Lê usuarios/migracao/conciliacao.json (gerado pela Task 5). Nunca escreve no
 * aparelho — só no Postgres do Coliseu.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../src/lib/db";
import { adotarConciliacao } from "../../src/lib/migracao/adotar";
import type { ItemConciliacao } from "../../src/lib/migracao/conciliar";

const ARQ_PADRAO = resolve(__dirname, "../../usuarios/migracao/conciliacao.json");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const incluirRevisar = args.includes("--incluir-revisar");
  const deviceArg = args.includes("--device") ? args[args.indexOf("--device") + 1] : null;
  const arquivoArg = args.includes("--arquivo") ? args[args.indexOf("--arquivo") + 1] : null;
  const ARQ_CONCILIACAO = arquivoArg ? resolve(process.cwd(), arquivoArg) : ARQ_PADRAO;

  const conciliacao = JSON.parse(readFileSync(ARQ_CONCILIACAO, "utf8")) as {
    geradoEm: string;
    itens: ItemConciliacao[];
  };
  console.log(`conciliação de ${conciliacao.geradoEm} — ${conciliacao.itens.length} itens`);

  let deviceId = deviceArg;
  if (!deviceId) {
    const devices = await prisma.accessDevice.findMany();
    if (devices.length !== 1) {
      throw new Error(
        `há ${devices.length} catracas no banco — passe --device <id>:\n` +
        devices.map((d) => `  ${d.id}  ${d.name} (${d.lanHost ?? "sem host"})`).join("\n"),
      );
    }
    deviceId = devices[0].id;
    console.log(`catraca única: ${devices[0].name} (${deviceId})`);
  }

  const r = await adotarConciliacao(conciliacao.itens, { deviceId, apply, incluirRevisar });

  console.log([
    ``,
    r.dryRun ? ">>> DRY-RUN — nada foi gravado. Use --apply para efetivar. <<<" : ">>> APLICADO <<<",
    `consideráveis: ${r.consideraveis}${incluirRevisar ? " (ADOTAR + REVISAR)" : " (só ADOTAR)"}`,
    `adotados:      ${r.adotados}`,
    `já adotados:   ${r.jaAdotados} (pulados — idempotência)`,
    `pessoas:       ${r.pessoasCriadas} criadas, ${r.pessoasReusadas} reusadas por CPF`,
    `planos criados:${r.planosCriados} (nascem inativos — revisar valor/duração)`,
    ...(r.avisos.length ? [``, `avisos (${r.avisos.length}):`, ...r.avisos.map((a) => `  - ${a}`)] : []),
    ...(!r.dryRun ? [
      ``,
      `Pós-apply (Task 6, Step 3): confira ACCESS_EXTERNAL_ID_FLOOR no ambiente —`,
      `deve ser ≥ maior user_id do aparelho (inventário 2026-07-17: 11097953) — e reinicie o backend.`,
    ] : []),
  ].join("\n"));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
