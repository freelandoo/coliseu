import { beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  FREELANDOO_PROVIDER,
  gerarTokenFreelandoo,
  sha256Hex,
  statusTokenFreelandoo,
} from "@/lib/freelandoo/token";

async function adminSeed() {
  return prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
}

beforeEach(async () => {
  await prisma.apiToken.deleteMany({ where: { provider: FREELANDOO_PROVIDER } });
});

test("gerar cria token de 64 hex, guarda só o hash e status reflete", async () => {
  const admin = await adminSeed();
  const token = await gerarTokenFreelandoo(admin.id);
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  const row = await prisma.apiToken.findUniqueOrThrow({ where: { provider: FREELANDOO_PROVIDER } });
  expect(row.tokenHash).toBe(sha256Hex(token));
  expect(row.tokenHash).not.toBe(token);

  const status = await statusTokenFreelandoo();
  expect(status.exists).toBe(true);
  expect(status.createdByNome).toBe(admin.nome);
  expect(status.lastUsedAt).toBeNull();
});

test("status sem token gerado", async () => {
  expect(await statusTokenFreelandoo()).toEqual({
    exists: false, createdAt: null, createdByNome: null, lastUsedAt: null,
  });
});

test("rotacionar substitui o hash — o token antigo deixa de bater", async () => {
  const admin = await adminSeed();
  const antigo = await gerarTokenFreelandoo(admin.id);
  const novo = await gerarTokenFreelandoo(admin.id);
  expect(novo).not.toBe(antigo);

  const row = await prisma.apiToken.findUniqueOrThrow({ where: { provider: FREELANDOO_PROVIDER } });
  expect(row.tokenHash).toBe(sha256Hex(novo));
  expect(row.tokenHash).not.toBe(sha256Hex(antigo));

  const count = await prisma.apiToken.count({ where: { provider: FREELANDOO_PROVIDER } });
  expect(count).toBe(1);
});

test("gerar registra AuditLog sem vazar hash nem token", async () => {
  const admin = await adminSeed();
  const token = await gerarTokenFreelandoo(admin.id);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { entity: "ApiToken", action: "freelandoo_token.rotate" },
    orderBy: { at: "desc" },
  });
  expect(log.actorType).toBe("USER");
  expect(log.actorId).toBe(admin.id);
  const dump = JSON.stringify(log);
  expect(dump).not.toContain(token);
  expect(dump).not.toContain(sha256Hex(token));
});
