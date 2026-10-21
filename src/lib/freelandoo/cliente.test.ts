import { describe, expect, test, vi } from "vitest";
import { configFreelandoo, criarClienteFreelandoo, erroDaResposta } from "@/lib/freelandoo/cliente";

const CFG = { url: "https://fl.test", chave: "k-123" };

function resposta(status: number, corpo: unknown) {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status, headers: { "Content-Type": "application/json" },
  });
}

describe("erroDaResposta", () => {
  test.each([
    [401, { erro: "chave_invalida" }, "chave_invalida"],
    [403, null, "chave_invalida"],
    [500, { erro: "cpf_invalido" }, "transitorio"],
    [503, null, "transitorio"],
    [429, null, "transitorio"],
    [422, { erro: "cpf_invalido" }, "cpf_invalido"],
    [422, { erro: "dados_incompletos" }, "dados_incompletos"],
    [422, { erro: "menor_de_idade" }, "menor_de_idade"],
    [409, { erro: "email_em_uso" }, "email_em_uso"],
    [409, { erro: "ja_aceito" }, "ja_aceito"],
    [404, { erro: "nao_encontrado" }, "nao_encontrado"],
    [404, null, "nao_encontrado"],
    [400, { erro: "coisa_nova" }, "inesperado"],
  ] as const)("%i %j → %s", (status, corpo, esperado) => {
    expect(erroDaResposta(status, corpo)).toBe(esperado);
  });
});

describe("configFreelandoo", () => {
  test("sem URL ou sem chave = não configurado", () => {
    expect(configFreelandoo({})).toBeNull();
    expect(configFreelandoo({ FREELANDOO_API_URL: "https://x" })).toBeNull();
    expect(configFreelandoo({ FREELANDOO_PARTNER_KEY: "k" })).toBeNull();
  });
  test("tira a barra final da URL", () => {
    expect(configFreelandoo({ FREELANDOO_API_URL: "https://x/// ", FREELANDOO_PARTNER_KEY: " k " })).toEqual({
      url: "https://x", chave: "k",
    });
  });
  test("cliente sem config responde nao_configurado sem tocar na rede", async () => {
    const f = vi.fn();
    const c = criarClienteFreelandoo(null, f as unknown as typeof fetch);
    expect(await c.listarMembros()).toEqual({ ok: false, erro: "nao_configurado" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("criarClienteFreelandoo", () => {
  test("POST members com Bearer e JSON; 201 criado", async () => {
    const f = vi.fn(async () =>
      resposta(201, { id_user: "u1", status: "criado", estado: "aguardando_aceite", link_primeiro_acesso: "https://l", expira_em: "2026-10-27" }),
    );
    const c = criarClienteFreelandoo(CFG, f as unknown as typeof fetch);
    const r = await c.criarMembro({
      cpf: "52998224725", nome: "Maria", email: "m@x.com", data_nascimento: "1990-07-30", ref_externa: "p1",
    });
    expect(r).toMatchObject({ ok: true, dados: { status: "criado", id_user: "u1" } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://fl.test/partner/v1/members");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k-123");
    expect(JSON.parse(init.body as string)).toMatchObject({ cpf: "52998224725", ref_externa: "p1" });
  });

  test("200 vinculado também é sucesso", async () => {
    const c = criarClienteFreelandoo(CFG, (async () => resposta(200, { id_user: "u2", status: "vinculado", estado: "ativa" })) as unknown as typeof fetch);
    expect(await c.criarMembro({ cpf: "1", nome: "a", email: "b", data_nascimento: "c", ref_externa: "d" })).toMatchObject({
      ok: true, dados: { status: "vinculado", estado: "ativa" },
    });
  });

  test("409 email_em_uso vira erro tipado", async () => {
    const c = criarClienteFreelandoo(CFG, (async () => resposta(409, { erro: "email_em_uso" })) as unknown as typeof fetch);
    expect(await c.criarMembro({ cpf: "1", nome: "a", email: "b", data_nascimento: "c", ref_externa: "d" })).toMatchObject({
      ok: false, erro: "email_em_uso", status: 409,
    });
  });

  test("falha de rede e tempo esgotado = transitório", async () => {
    const c = criarClienteFreelandoo(CFG, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await c.obterMembro("u1")).toMatchObject({ ok: false, erro: "transitorio" });
  });

  test("2xx com corpo fora do contrato = inesperado", async () => {
    const c = criarClienteFreelandoo(CFG, (async () => new Response("ok", { status: 200 })) as unknown as typeof fetch);
    expect(await c.obterMembro("u1")).toMatchObject({ ok: false, erro: "inesperado" });
  });

  test("listagem manda cursor e limit; foto vai em multipart no campo `foto`", async () => {
    const chamadas: [string, RequestInit][] = [];
    const f = (async (url: string, init: RequestInit) => {
      chamadas.push([url, init]);
      return url.includes("foto-academia") ? resposta(200, { ok: true }) : resposta(200, { itens: [], proximo_cursor: null });
    }) as unknown as typeof fetch;
    const c = criarClienteFreelandoo(CFG, f);
    await c.listarMembros("abc", 200);
    expect(chamadas[0][0]).toBe("https://fl.test/partner/v1/members?limit=200&cursor=abc");
    expect(await c.enviarFotoAcademia("u/1", new Uint8Array([0xff, 0xd8]))).toEqual({ ok: true, dados: { ok: true } });
    expect(chamadas[1][0]).toBe("https://fl.test/partner/v1/members/u%2F1/foto-academia");
    expect(chamadas[1][1].method).toBe("PUT");
    const corpo = chamadas[1][1].body as FormData;
    expect(corpo.get("foto")).toBeInstanceOf(Blob);
  });
});
