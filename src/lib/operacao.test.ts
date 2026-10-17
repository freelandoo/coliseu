import { describe, expect, test } from "vitest";
import { lerResultado, temId, temOk } from "@/lib/operacao";

const json = (corpo: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }),
  );

describe("lerResultado", () => {
  test("2xx no formato esperado é sucesso", async () => {
    const r = await lerResultado(json({ id: "p1", nome: "Ana" }, 201), temId);
    expect(r).toEqual({ tipo: "ok", dados: { id: "p1", nome: "Ana" } });
  });

  test("4xx com erro é falha conhecida, com a mensagem do servidor", async () => {
    const r = await lerResultado(json({ erro: "CPF deve ter 11 dígitos" }, 400), temId);
    expect(r).toMatchObject({ tipo: "falha", status: 400, erro: "CPF deve ter 11 dígitos" });
  });

  test("4xx sem corpo usa a mensagem padrão", async () => {
    const r = await lerResultado(Promise.resolve(new Response("", { status: 404 })), temId, "Não achei.");
    expect(r).toMatchObject({ tipo: "falha", status: 404, erro: "Não achei." });
  });

  test("5xx com erro tratado pela rota (ex.: Asaas recusou) é falha conhecida", async () => {
    const r = await lerResultado(json({ erro: "Falha ao criar assinatura no Asaas" }, 502), temId);
    expect(r).toMatchObject({ tipo: "falha", status: 502 });
  });

  test("5xx sem explicação é desconhecido — pode ter acontecido", async () => {
    const r = await lerResultado(
      Promise.resolve(new Response("<html>Internal Server Error</html>", { status: 500 })),
      temId,
    );
    expect(r).toEqual({ tipo: "desconhecido", motivo: "resposta", status: 500 });
  });

  test("200 com JSON inválido ou sem o campo esperado nunca vira sucesso", async () => {
    const invalido = await lerResultado(Promise.resolve(new Response("ok", { status: 200 })), temId);
    expect(invalido.tipo).toBe("desconhecido");
    const semId = await lerResultado(json({ nome: "Ana" }), temId);
    expect(semId.tipo).toBe("desconhecido");
    const okFalso = await lerResultado(json({ ok: false }), temOk);
    expect(okFalso.tipo).toBe("desconhecido");
  });

  test("rede caída e tempo esgotado são desconhecidos, não falha", async () => {
    const rede = await lerResultado(Promise.reject(new TypeError("Failed to fetch")), temId);
    expect(rede).toEqual({ tipo: "desconhecido", motivo: "rede" });
    const tempo = await lerResultado(
      Promise.reject(new DOMException("tempo", "TimeoutError")),
      temId,
    );
    expect(tempo).toEqual({ tipo: "desconhecido", motivo: "tempo" });
  });
});
