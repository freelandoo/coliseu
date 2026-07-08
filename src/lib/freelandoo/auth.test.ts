import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { FREELANDOO_PROVIDER, gerarTokenFreelandoo } from "@/lib/freelandoo/token";

function reqCom(token?: string): Request {
  return new Request("http://localhost/api/freelandoo/member", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(async () => {
  await prisma.apiToken.deleteMany({ where: { provider: FREELANDOO_PROVIDER } });
  vi.stubEnv("FREELANDOO_API_TOKEN", "");
  delete process.env.FREELANDOO_API_TOKEN;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("token do banco válido passa e marca lastUsedAt", async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const token = await gerarTokenFreelandoo(admin.id);
  expect(await exigirFreelandoo(reqCom(token))).toBeNull();
  const row = await prisma.apiToken.findUniqueOrThrow({ where: { provider: FREELANDOO_PROVIDER } });
  expect(row.lastUsedAt).not.toBeNull();
});

test("com token no banco, valor errado dá 401 — mesmo se a env casar", async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  await gerarTokenFreelandoo(admin.id);
  vi.stubEnv("FREELANDOO_API_TOKEN", "valor-da-env");
  const res = await exigirFreelandoo(reqCom("valor-da-env"));
  expect(res?.status).toBe(401);
});

test("sem registro no banco cai no fallback da env", async () => {
  vi.stubEnv("FREELANDOO_API_TOKEN", "segredo-env");
  expect(await exigirFreelandoo(reqCom("segredo-env"))).toBeNull();
  const res = await exigirFreelandoo(reqCom("errado"));
  expect(res?.status).toBe(401);
});

test("dev sem banco e sem env libera", async () => {
  expect(await exigirFreelandoo(reqCom())).toBeNull();
});

test("produção sem banco e sem env dá 503", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const res = await exigirFreelandoo(reqCom("qualquer"));
  expect(res?.status).toBe(503);
});
