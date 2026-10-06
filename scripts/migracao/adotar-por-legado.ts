/**
 * Adoção por id legado: vincula os usuários do iDFace às pessoas importadas do CloudGym.
 *
 * O user_id do aparelho É o id do cliente no CloudGym (o sync do CloudGym grava assim),
 * e a importação completa guardou esse id em Person.legacyCloudgymId. Então o vínculo é
 * exato — sem conciliação por nome.
 *
 * Uso:
 *   npx tsx scripts/migracao/adotar-por-legado.ts --backup <backup.csv do iDFace>          → dry-run
 *   npx tsx scripts/migracao/adotar-por-legado.ts --backup <arq> --apply [--device <id>]
 *
 * Mesmo contrato do adotar.ts: mapping nasce IN_SYNC (o usuário já existe no aparelho) e
 * face ENROLLED; nada é enfileirado e nada é escrito no aparelho. Idempotente.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../src/lib/db";

interface UsuarioDevice { id: string; nome: string; imageTimestamp: number; lastAccess: number }

/** Lê a seção `users` do backup.csv do iDFace (várias tabelas concatenadas, separadas por linha vazia). */
export function lerUsuariosDoBackup(texto: string): UsuarioDevice[] {
  const linhas = texto.split(/\r?\n/);
  const ini = linhas.indexOf("users");
  if (ini < 0) throw new Error("seção 'users' não encontrada no backup");
  const cab = linhas[ini + 1].split(",");
  if (cab[0] !== "id" || cab[2] !== "name") throw new Error(`cabeçalho inesperado: ${linhas[ini + 1]}`);
  const fim = cab.length;
  const out: UsuarioDevice[] = [];
  for (let j = ini + 2; j < linhas.length && linhas[j] !== ""; j++) {
    const v = linhas[j].split(",");
    // nome pode conter vírgula: id é o 1º campo, timestamps são os 2 últimos
    const nome = v.slice(2, v.length - (fim - 3)).join(",");
    out.push({
      id: v[0], nome: nome.trim(),
      imageTimestamp: Number(v[v.length - 2]) || 0, lastAccess: Number(v[v.length - 1]) || 0,
    });
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const arqBackup = arg("--backup");
  if (!arqBackup) throw new Error("informe --backup <caminho do backup.csv>");

  const usuarios = lerUsuariosDoBackup(readFileSync(resolve(process.cwd(), arqBackup), "utf8"));
  const deviceId = arg("--device") ?? (await prisma.accessDevice.findFirstOrThrow({
    where: { name: "Catraca Principal" }, select: { id: true },
  })).id;
  console.log(`${apply ? "APPLY" : "DRY-RUN"} · device ${deviceId} · ${usuarios.length} usuários no aparelho`);

  const mappings = await prisma.deviceUserMapping.findMany({ where: { deviceId } });
  const porExt = new Map(mappings.map((m) => [m.externalUserId, m]));
  const porPessoa = new Map(mappings.map((m) => [m.personId, m]));
  const pessoas = await prisma.person.findMany({
    where: { legacyCloudgymId: { not: null } },
    select: { id: true, nome: true, legacyCloudgymId: true, memberships: { select: { status: true } } },
  });
  const porLegado = new Map(pessoas.map((p) => [String(p.legacyCloudgymId), p]));

  const r = { jaVinculados: 0, adotar: 0, adotarAtivos: 0, semPessoa: [] as string[], conflitos: [] as string[], negativosSemVinculo: [] as string[] };
  const fila: { u: UsuarioDevice; personId: string; trocarDe?: string }[] = [];

  for (const u of usuarios) {
    const m = porExt.get(u.id);
    if (m) { r.jaVinculados++; continue; }
    if (Number(u.id) < 0) { r.negativosSemVinculo.push(`${u.id} ${u.nome}`); continue; }
    const p = porLegado.get(u.id);
    if (!p) { r.semPessoa.push(`${u.id} ${u.nome}`); continue; }
    const outro = porPessoa.get(p.id);
    if (outro) {
      // pessoa já tem id alocado pelo Coliseu: só troca se o mapping nunca chegou ao aparelho
      if (outro.syncStatus === "IN_SYNC") { r.conflitos.push(`${u.id} ${u.nome} — pessoa já IN_SYNC com ${outro.externalUserId}`); continue; }
      fila.push({ u, personId: p.id, trocarDe: outro.externalUserId });
    } else {
      fila.push({ u, personId: p.id });
    }
    r.adotar++;
    if (p.memberships.some((x) => x.status === "ACTIVE")) r.adotarAtivos++;
  }

  console.log({
    jaVinculados: r.jaVinculados, adotar: r.adotar, adotarComMatriculaAtiva: r.adotarAtivos,
    trocamIdPendente: fila.filter((f) => f.trocarDe).length,
    semPessoa: r.semPessoa.length, conflitos: r.conflitos.length, negativosSemVinculo: r.negativosSemVinculo.length,
  });
  for (const [k, l] of [["sem pessoa", r.semPessoa], ["conflitos", r.conflitos], ["negativos sem vínculo", r.negativosSemVinculo]] as const) {
    if (l.length) console.log(`— ${k}:\n  ${l.join("\n  ")}`);
  }
  for (const f of fila.filter((x) => x.trocarDe)) console.log(`  troca id pendente ${f.trocarDe} → ${f.u.id} (${f.u.nome})`);
  if (!apply) { console.log("dry-run: nada gravado"); return; }

  let feitos = 0;
  for (const { u, personId, trocarDe } of fila) {
    await prisma.$transaction(async (tx) => {
      if (trocarDe) {
        // o id do aparelho vence (é onde a face mora); UPSERT pendente do id antigo criaria usuário fantasma
        await tx.deviceCommand.deleteMany({ where: { deviceId, personId, status: "PENDING" } });
        await tx.deviceUserMapping.update({
          where: { deviceId_personId: { deviceId, personId } },
          data: { externalUserId: u.id, syncStatus: "IN_SYNC", lastSyncAt: new Date() },
        });
      } else {
        await tx.deviceUserMapping.create({
          data: { deviceId, personId, externalUserId: u.id, syncStatus: "IN_SYNC", lastSyncAt: new Date() },
        });
      }
      const enrolledAt = u.imageTimestamp ? new Date(u.imageTimestamp * 1000) : new Date();
      const face = await tx.accessCredential.findFirst({ where: { personId, type: "FACE" } });
      if (face) {
        await tx.accessCredential.update({
          where: { id: face.id },
          data: { status: "ENROLLED", deviceRef: u.id, enrolledAt, revokedAt: null },
        });
      } else {
        await tx.accessCredential.create({
          data: { personId, type: "FACE", status: "ENROLLED", deviceRef: u.id, enrolledAt },
        });
      }
    });
    if (++feitos % 100 === 0) console.log(`  ${feitos}/${fila.length}`);
  }
  console.log(`adotados: ${feitos}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
