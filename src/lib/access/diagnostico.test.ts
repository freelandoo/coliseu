import { beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { corrigirAcesso, diagnosticarAcesso } from "@/lib/access/diagnostico";

let unitId = "";
let planId = "";
let deviceId = "";

beforeAll(async () => {
  unitId = (await prisma.unit.findFirstOrThrow()).id;
  planId = (await prisma.plan.findFirstOrThrow()).id;
  deviceId = (await prisma.accessDevice.findFirstOrThrow()).id;
});

async function adotado(codigo: string, vencimento: Date, externalUserId: string, sync: "IN_SYNC" | "ERROR") {
  const p = await prisma.person.create({
    data: { codigo, nome: `Adotado ${codigo}`, origem: "whatsapp", fase: "aluno", unitId },
  });
  await prisma.membership.create({ data: { personId: p.id, planId, status: "ACTIVE", vencimentoPlano: vencimento } });
  await prisma.accessCredential.create({ data: { personId: p.id, type: "FACE", status: "ENROLLED", enrolledAt: new Date() } });
  await prisma.deviceUserMapping.create({ data: { deviceId, personId: p.id, externalUserId, syncStatus: sync } });
  return p;
}

test("aluno adotado sem cobrança no Coliseu, plano em dia: passa na catraca", async () => {
  const p = await adotado("TDIAG1", new Date(Date.now() + 20 * 86_400_000), "9101", "IN_SYNC");
  const d = await diagnosticarAcesso(p.id);
  expect(d?.liberado).toBe(true);
  expect(d?.checklist.find((c) => c.item === "Mensalidade")?.ok).toBe(true);

  await corrigirAcesso(p.id);
  const enable = await prisma.deviceCommand.findFirst({ where: { personId: p.id, type: "ENABLE" } });
  expect(enable).not.toBeNull();
  // já sincronizado: não reenvia o cadastro (preserva o usuário adotado no aparelho)
  expect(await prisma.deviceCommand.count({ where: { personId: p.id, deviceId, type: "UPSERT_USER" } })).toBe(0);
});

test("envio com erro: Corrigir agora volta para pendente e reenvia o cadastro", async () => {
  const p = await adotado("TDIAG2", new Date(Date.now() + 20 * 86_400_000), "9102", "ERROR");
  const antes = await diagnosticarAcesso(p.id);
  expect(antes?.liberado).toBe(false);
  expect(antes?.checklist.find((c) => c.item === "No aparelho")?.ok).toBe(false);

  const r = await corrigirAcesso(p.id);
  expect(r.reenvios).toBeGreaterThanOrEqual(1);
  const m = await prisma.deviceUserMapping.findFirstOrThrow({ where: { personId: p.id, deviceId } });
  expect(m.syncStatus).toBe("PENDING");
  expect(await prisma.deviceCommand.count({ where: { personId: p.id, deviceId, type: "UPSERT_USER", status: "PENDING" } })).toBe(1);
});

test("plano vencido além da carência: não passa, motivo é renovar", async () => {
  const p = await adotado("TDIAG3", new Date(Date.now() - 30 * 86_400_000), "9103", "IN_SYNC");
  const d = await diagnosticarAcesso(p.id);
  expect(d?.liberado).toBe(false);
  expect(d?.motivo).toMatch(/Renove/);
});
