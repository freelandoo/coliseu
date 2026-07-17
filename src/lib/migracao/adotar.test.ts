import { beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { adotarConciliacao } from "@/lib/migracao/adotar";
import type { ItemConciliacao, UsuarioDevice } from "@/lib/migracao/conciliar";
import type { AlunoCloudGym } from "@/lib/migracao/cloudgym";
import { normalizarNome } from "@/lib/migracao/normalizar";

let deviceId = "";

beforeAll(async () => {
  deviceId = (await prisma.accessDevice.findFirstOrThrow()).id;
  // Resíduo de rodadas anteriores: o cascade de Person leva membership/mapping/credential.
  await prisma.person.deleteMany({
    where: { OR: [{ codigo: { startsWith: "TMIG" } }, { nome: { startsWith: "Migrad" } }, { nome: "Pessoa Ja No Coliseu" }] },
  });
  await prisma.plan.deleteMany({ where: { nome: "MIGR PLANO TESTE" } });
});

function itemAdotar(idDevice: number, nome: string, extra: Partial<AlunoCloudGym> = {}): ItemConciliacao {
  const device: UsuarioDevice = {
    id: idDevice, registration: "", name: nome, nomeNorm: normalizarNome(nome),
    imageTimestamp: 1_719_000_000, lastAccess: 1_784_000_000,
  };
  const aluno: AlunoCloudGym = {
    nome, nomeNorm: normalizarNome(nome), status: "ATIVO", cpf: "", email: "", celular: "",
    plano: "MIGR PLANO TESTE", inicioISO: "2026-01-10", fimISO: "2027-01-10",
    nascimentoISO: null, estado: "SP", cidade: "SBC", cep: "", ...extra,
  };
  return { device, aluno, personIdExistente: null, via: "NOME_EXATO", confianca: "ALTA", situacao: "ADOTAR", motivo: "teste" };
}

test("dry-run (default) não escreve nada", async () => {
  const antes = await prisma.person.count();
  const r = await adotarConciliacao([itemAdotar(-91001, "Migrado Dry Run")], { deviceId });
  expect(r.dryRun).toBe(true);
  expect(r.adotados).toBe(1);
  expect(await prisma.person.count()).toBe(antes);
  expect(await prisma.deviceUserMapping.findFirst({ where: { deviceId, externalUserId: "-91001" } })).toBeNull();
});

test("apply: adota com externalUserId do aparelho (id negativo inclusive), IN_SYNC e face ENROLLED", async () => {
  const r = await adotarConciliacao([itemAdotar(-91002, "Migrada Apply Um", { cpf: "39053344705" })], { deviceId, apply: true });
  expect(r.adotados).toBe(1);
  expect(r.pessoasCriadas).toBe(1);

  const mapping = await prisma.deviceUserMapping.findUniqueOrThrow({
    where: { deviceId_externalUserId: { deviceId, externalUserId: "-91002" } },
  });
  expect(mapping.syncStatus).toBe("IN_SYNC");

  const person = await prisma.person.findUniqueOrThrow({ where: { id: mapping.personId } });
  expect(person.fase).toBe("aluno");
  expect(person.cpf).toBe("39053344705");

  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: person.id, type: "FACE" } });
  expect(cred.status).toBe("ENROLLED");
  expect(cred.deviceRef).toBe("-91002");
  expect(cred.enrolledAt?.getTime()).toBe(1_719_000_000 * 1000);

  const membership = await prisma.membership.findFirstOrThrow({ where: { personId: person.id } });
  expect(membership.status).toBe("ACTIVE");
  expect(membership.vencimentoPlano.toISOString().slice(0, 10)).toBe("2027-01-10");

  // plano importado nasce inativo (não vendável) para revisão manual
  const plano = await prisma.plan.findUniqueOrThrow({ where: { id: membership.planId } });
  expect(plano.ativo).toBe(false);

  // adoção NÃO enfileira comando pro aparelho (R2: nada de UPSERT sobrescrevendo registration)
  expect(await prisma.deviceCommand.count({ where: { personId: person.id } })).toBe(0);
});

test("idempotente: rodar duas vezes não duplica nada", async () => {
  const item = itemAdotar(-91003, "Migrada Idempotente");
  await adotarConciliacao([item], { deviceId, apply: true });
  const r2 = await adotarConciliacao([item], { deviceId, apply: true });
  expect(r2.adotados).toBe(0);
  expect(r2.jaAdotados).toBe(1);
  expect(await prisma.person.count({ where: { nome: "Migrada Idempotente" } })).toBe(1);
  expect(await prisma.deviceUserMapping.count({ where: { deviceId, externalUserId: "-91003" } })).toBe(1);
});

test("BLOQUEADO vira membership SUSPENDED; REVISAR só entra com incluirRevisar", async () => {
  const bloqueado = itemAdotar(-91004, "Migrado Bloqueado", { status: "BLOQUEADO" });
  const revisar: ItemConciliacao = { ...itemAdotar(-91005, "Migrado Revisar"), situacao: "REVISAR", confianca: "MEDIA" };

  const semFlag = await adotarConciliacao([bloqueado, revisar], { deviceId, apply: true });
  expect(semFlag.adotados).toBe(1); // só o bloqueado

  const m = await prisma.deviceUserMapping.findUniqueOrThrow({
    where: { deviceId_externalUserId: { deviceId, externalUserId: "-91004" } },
  });
  const membership = await prisma.membership.findFirstOrThrow({ where: { personId: m.personId } });
  expect(membership.status).toBe("SUSPENDED");

  const comFlag = await adotarConciliacao([revisar], { deviceId, apply: true, incluirRevisar: true });
  expect(comFlag.adotados).toBe(1);
});

test("pessoa reusada com mapping antigo no device: id do aparelho vence e PENDING morre", async () => {
  const unitId = (await prisma.unit.findFirstOrThrow()).id;
  const pessoa = await prisma.person.create({
    data: { codigo: "TMIG2", nome: "Migrada Piloto", cpf: "11144477735", origem: "balcao", fase: "aluno", unitId },
  });
  // estado do piloto: mapping PENDING com id alocado 100x + comando na fila + face antiga
  await prisma.deviceUserMapping.create({
    data: { deviceId, personId: pessoa.id, externalUserId: "1099", syncStatus: "PENDING" },
  });
  await prisma.deviceCommand.create({
    data: {
      deviceId, personId: pessoa.id, type: "UPSERT_USER", status: "PENDING",
      payload: { externalUserId: "1099" }, dedupeKey: `tmig2-upsert-1099`,
    },
  });
  await prisma.accessCredential.create({
    data: { personId: pessoa.id, type: "FACE", status: "IN_PROGRESS", deviceRef: "1099" },
  });

  const r = await adotarConciliacao(
    [itemAdotar(8676357, "Migrada Piloto", { cpf: "11144477735" })],
    { deviceId, apply: true },
  );
  expect(r.adotados).toBe(1);
  expect(r.pessoasReusadas).toBe(1);

  const mapping = await prisma.deviceUserMapping.findUniqueOrThrow({
    where: { deviceId_personId: { deviceId, personId: pessoa.id } },
  });
  expect(mapping.externalUserId).toBe("8676357");
  expect(mapping.syncStatus).toBe("IN_SYNC");
  expect(await prisma.deviceUserMapping.count({ where: { deviceId, personId: pessoa.id } })).toBe(1);
  expect(await prisma.deviceCommand.count({ where: { deviceId, personId: pessoa.id, status: "PENDING" } })).toBe(0);

  const face = await prisma.accessCredential.findFirstOrThrow({ where: { personId: pessoa.id, type: "FACE" } });
  expect(face.deviceRef).toBe("8676357");
  expect(face.status).toBe("ENROLLED");
});

test("reusa Person existente por CPF em vez de duplicar", async () => {
  const existente = await prisma.person.create({
    data: {
      codigo: "TMIG1", nome: "Pessoa Ja No Coliseu", cpf: "52998224725",
      origem: "balcao", fase: "lead", estagio: "novo",
      unitId: (await prisma.unit.findFirstOrThrow()).id,
    },
  });
  const r = await adotarConciliacao(
    [itemAdotar(-91006, "Pessoa Ja No Coliseu", { cpf: "52998224725" })],
    { deviceId, apply: true },
  );
  expect(r.pessoasReusadas).toBe(1);
  expect(r.pessoasCriadas).toBe(0);
  const mapping = await prisma.deviceUserMapping.findUniqueOrThrow({
    where: { deviceId_externalUserId: { deviceId, externalUserId: "-91006" } },
  });
  expect(mapping.personId).toBe(existente.id);
  expect((await prisma.person.findUniqueOrThrow({ where: { id: existente.id } })).fase).toBe("aluno");
});
