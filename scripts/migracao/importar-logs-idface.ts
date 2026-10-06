/**
 * Importa o histórico de `access_logs` de um export do iDFace (logs.csv ou backup.csv)
 * para AccessEvent — preenche o período em que o agente não enviou eventos.
 *
 * Uso:
 *   npx tsx scripts/migracao/importar-logs-idface.ts --arquivo <logs.csv>            → dry-run
 *   npx tsx scripts/migracao/importar-logs-idface.ts --arquivo <logs.csv> --apply [--device <id>]
 *
 * deviceEventId = access_logs.id (mesma sequência que o agente usa) ⇒ eventos que o agente
 * já ingeriu são pulados pelo unique (deviceId, deviceEventId). Tradução de evento idêntica
 * à do agente (mapAccessLog). Pessoa: mapping do aparelho, senão Person.legacyCloudgymId.
 * Ao final avança Membership.ultimaPresenca (só para frente), como o ingest faz.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../src/lib/db";
import { mapAccessLog } from "../../access-agent/src/adapters/controlid/mapping";

const LOTE = 2000;

function lerAccessLogs(texto: string) {
  const linhas = texto.split(/\r?\n/);
  const ini = linhas.indexOf("access_logs");
  if (ini < 0) throw new Error("seção 'access_logs' não encontrada");
  const cab = linhas[ini + 1].split(",");
  const col = (n: string) => cab.indexOf(n);
  const [cId, cTime, cEvent, cUser, cPortal] = ["id", "time", "event", "user_id", "portal_id"].map(col);
  const out = [];
  for (let j = ini + 2; j < linhas.length && linhas[j] !== ""; j++) {
    const v = linhas[j].split(",");
    out.push({
      id: Number(v[cId]), time: Number(v[cTime]), event: Number(v[cEvent]),
      user_id: v[cUser] ? Number(v[cUser]) : undefined,
      portal_id: v[cPortal] ? Number(v[cPortal]) : undefined,
    });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const arquivo = arg("--arquivo");
  if (!arquivo) throw new Error("informe --arquivo <logs.csv>");

  const device = arg("--device")
    ? await prisma.accessDevice.findUniqueOrThrow({ where: { id: arg("--device")! } })
    : await prisma.accessDevice.findFirstOrThrow({ where: { name: "Catraca Principal" } });

  const brutos = lerAccessLogs(readFileSync(resolve(process.cwd(), arquivo), "utf8"));
  // Relógio zerado do aparelho (1969/1970) não é data real: descarta.
  const PISO = Date.UTC(2020, 0, 1) / 1000;
  const eventos = brutos.map((l) => mapAccessLog(l)).filter((e) => e !== null);
  const validos = eventos.filter((e) => Date.parse(e.deviceTime) / 1000 > PISO);

  const mappings = await prisma.deviceUserMapping.findMany({ where: { deviceId: device.id }, select: { externalUserId: true, personId: true } });
  const porExt = new Map(mappings.map((m) => [m.externalUserId, m.personId]));
  const legados = await prisma.person.findMany({ where: { legacyCloudgymId: { not: null } }, select: { id: true, legacyCloudgymId: true } });
  const porLegado = new Map(legados.map((p) => [String(p.legacyCloudgymId), p.id]));

  const existentes = new Set((await prisma.accessEvent.findMany({
    where: { deviceId: device.id }, select: { deviceEventId: true },
  })).map((e) => e.deviceEventId));

  let viaMapping = 0, viaLegado = 0, semPessoa = 0, anonimos = 0;
  const novos = validos.filter((e) => !existentes.has(e.deviceEventId)).map((e) => {
    let personId: string | null = null;
    if (e.externalUserId) {
      personId = porExt.get(e.externalUserId) ?? null;
      if (personId) viaMapping++;
      else if ((personId = porLegado.get(e.externalUserId) ?? null)) viaLegado++;
      else semPessoa++;
    } else anonimos++;
    return {
      deviceId: device.id, deviceEventId: e.deviceEventId, personId, unitId: device.unitId,
      deviceTime: new Date(e.deviceTime), direction: e.direction, decision: e.decision, reason: e.reason ?? null,
      physicallyPassed: e.physicallyPassed, mode: e.mode, deviceCursor: e.cursor ?? null,
    };
  });

  const porMes = new Map<string, number>();
  for (const e of novos) { const k = e.deviceTime.toISOString().slice(0, 7); porMes.set(k, (porMes.get(k) ?? 0) + 1); }
  console.log(`${apply ? "APPLY" : "DRY-RUN"} · device ${device.id}`);
  console.log({
    logsNoArquivo: brutos.length, decisoesDeAcesso: eventos.length, relogioInvalido: eventos.length - validos.length,
    jaNoBanco: validos.length - novos.length, novos: novos.length,
    permitidos: novos.filter((e) => e.decision === "ALLOWED").length, negados: novos.filter((e) => e.decision === "DENIED").length,
    pessoaViaMapping: viaMapping, pessoaViaLegado: viaLegado, usuarioSemPessoa: semPessoa, semUsuario: anonimos,
  });
  console.log("por mês:", Object.fromEntries([...porMes].sort()));
  if (!apply) { console.log("dry-run: nada gravado"); return; }

  let gravados = 0;
  for (let i = 0; i < novos.length; i += LOTE) {
    gravados += (await prisma.accessEvent.createMany({ data: novos.slice(i, i + LOTE), skipDuplicates: true })).count;
  }
  console.log(`eventos gravados: ${gravados}`);

  // Presença: mesmo critério do ingest (giro autorizado de entrada), só avança. Lê do banco
  // (não só dos novos) para que uma reexecução complete uma presença que ficou para trás.
  const ultimas = await prisma.accessEvent.groupBy({
    by: ["personId"], _max: { deviceTime: true },
    where: { deviceId: device.id, personId: { not: null }, decision: "ALLOWED", physicallyPassed: true, direction: "ENTRY" },
  });
  let presencas = 0;
  for (const { personId, _max } of ultimas) {
    const quando = _max.deviceTime;
    if (!personId || !quando) continue;
    const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" }, select: { id: true } });
    if (!m) continue;
    presencas += (await prisma.membership.updateMany({
      where: { id: m.id, ultimaPresenca: { lt: quando } },
      data: { ultimaPresenca: quando },
    })).count;
  }
  console.log(`presenças avançadas: ${presencas}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
