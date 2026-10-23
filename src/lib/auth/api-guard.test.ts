import { beforeEach, expect, test, vi } from "vitest";

const usuarioAtual = vi.fn();
vi.mock("@/lib/auth/session", () => ({ usuarioAtual: () => usuarioAtual() }));

const { exigirModuloApi } = await import("@/lib/auth/api-guard");

beforeEach(() => usuarioAtual.mockReset());

test("sem sessão: 401", async () => {
  usuarioAtual.mockResolvedValue(null);
  const g = await exigirModuloApi("matriculados");
  expect(g.erro?.status).toBe(401);
});

test("técnico não lista nem edita cadastro de pessoa: 403", async () => {
  usuarioAtual.mockResolvedValue({ id: "u1", role: "TECNICO" });
  const g = await exigirModuloApi("matriculados", "captacao");
  expect(g.erro?.status).toBe(403);
  expect(g.user).toBeNull();
});

test("recepção e admin passam; basta um dos módulos", async () => {
  usuarioAtual.mockResolvedValue({ id: "u2", role: "RECEPCAO" });
  expect((await exigirModuloApi("matriculados", "captacao")).erro).toBeNull();
  usuarioAtual.mockResolvedValue({ id: "u3", role: "ADMIN" });
  expect((await exigirModuloApi("relatorios")).erro).toBeNull();
});

test("o técnico continua com a catraca", async () => {
  usuarioAtual.mockResolvedValue({ id: "u4", role: "TECNICO" });
  expect((await exigirModuloApi("acesso")).erro).toBeNull();
});
