import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { removerAcessoDePessoa } from "@/lib/access/deprovision";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { revogarCredencial } from "@/lib/repositories/access";
import { matricularPessoaRepo, removerPessoaRepo } from "@/lib/repositories/pessoas";

let unitId = "";
let planId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
});

async function novoAlunoComFace(codigo: string) {
  const lead = await prisma.person.create({
    data: { codigo, nome: `Aluno ${codigo}`, origem: "balcao", fase: "lead", estagio: "novo", unitId },
  });
  await matricularPessoaRepo(lead.id, planId);
  await prisma.accessCredential.create({
    data: { personId: lead.id, type: "FACE", status: "ENROLLED", enrolledAt: new Date() },
  });
  return lead;
}

test("removerAcessoDePessoa: REMOVE_USER por device, credenciais revogadas, mappings apagados", async () => {
  const p = await novoAlunoComFace("TDEP1");
  const mappings = await prisma.deviceUserMapping.findMany({ where: { personId: p.id } });
  expect(mappings.length).toBeGreaterThanOrEqual(1);

  const r = await removerAcessoDePessoa(p.id);
  expect(r.comandos).toBe(mappings.length);

  for (const m of mappings) {
    const cmd = await prisma.deviceCommand.findFirstOrThrow({
      where: { personId: p.id, deviceId: m.deviceId, type: "REMOVE_USER" },
    });
    expect(cmd.status).toBe("PENDING");
    expect((cmd.payload as { externalUserId?: string }).externalUserId).toBe(m.externalUserId);
  }
  expect(await prisma.deviceUserMapping.count({ where: { personId: p.id } })).toBe(0);
  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: p.id, type: "FACE" } });
  expect(cred.status).toBe("REVOKED");
});

test("removerAcessoDePessoa cancela UPSERT/ENABLE pendentes (não recriariam o usuário no device)", async () => {
  const p = await novoAlunoComFace("TDEP2");
  // matrícula deixou UPSERT_USER pendente na fila
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, type: "UPSERT_USER", status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBeGreaterThanOrEqual(1);

  await removerAcessoDePessoa(p.id);
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, type: { not: "REMOVE_USER" }, status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBe(0);
});

test("removerPessoaRepo (LGPD): pessoa some do CRM e o REMOVE_USER sobrevive para o agente", async () => {
  const p = await novoAlunoComFace("TDEP3");
  const ok = await removerPessoaRepo(p.id);
  expect(ok).toBe(true);
  expect(await prisma.person.findUnique({ where: { id: p.id } })).toBeNull();
  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, type: "REMOVE_USER", status: "PENDING" },
  })).toBeGreaterThanOrEqual(1);
});

test("revogar credencial + recalcular: política nega (PENDING_ENROLLMENT) e emite DISABLE", async () => {
  const p = await novoAlunoComFace("TDEP4");
  const cred = await prisma.accessCredential.findFirstOrThrow({ where: { personId: p.id, type: "FACE" } });

  const r = await revogarCredencial(cred.id);
  expect(r.ok).toBe(true);
  expect(r.personId).toBe(p.id);
  await recalcularAcessoDePessoa(p.id);

  expect(await prisma.deviceCommand.count({
    where: { personId: p.id, type: "DISABLE", status: { in: ["PENDING", "DISPATCHED"] } },
  })).toBeGreaterThanOrEqual(1);
});
