import { describe, expect, it } from "vitest";
import { dadosLoginFalha, ipDaRequisicao } from "./login-falha";

function req(headers: Record<string, string>) {
  return new Request("http://localhost/api/auth/login", { method: "POST", headers });
}

describe("registro de login recusado", () => {
  it("pega o primeiro IP do x-forwarded-for", () => {
    expect(ipDaRequisicao(req({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }))).toBe("200.1.2.3");
  });

  it("sem cabeçalho de IP fica nulo", () => {
    expect(ipDaRequisicao(req({}))).toBeNull();
  });

  it("corta login e navegador gigantes e nunca leva a senha", () => {
    const d = dadosLoginFalha(req({ "user-agent": "x".repeat(1000) }), "a".repeat(500), "senha_errada", "u1");
    expect(d.identificador).toHaveLength(120);
    expect(d.userAgent).toHaveLength(300);
    expect(Object.keys(d)).not.toContain("senha");
    expect(d).toMatchObject({ motivo: "senha_errada", userId: "u1" });
  });
});
