import { describe, expect, test } from "vitest";
import { executarMatricula, idParaGuardar } from "@/lib/matricula-cliente";

type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> };

/** Servidor de mentira: responde na ordem dada e registra o que recebeu. */
function servidor(respostas: Array<() => Promise<Response>>) {
  const chamadas: Chamada[] = [];
  const buscar = async (url: string, init: RequestInit) => {
    chamadas.push({ url, metodo: String(init.method), corpo: JSON.parse(String(init.body ?? "{}")) });
    const r = respostas.shift();
    if (!r) throw new Error("chamada inesperada");
    return r();
  };
  return { buscar, chamadas };
}

const json = (corpo: unknown, status = 200) => () =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }));
const rede = () => () => Promise.reject(new TypeError("Failed to fetch"));
const html500 = () => () => Promise.resolve(new Response("<html>erro</html>", { status: 500 }));

const nova = { nome: "Bia", origem: "balcao" as const, telefone: "11999998888", cpf: "12345678909" };

describe("matrícula de pessoa nova", () => {
  test("cria e matricula; a cobrança nasce pendente (status vem do servidor, não da tela)", async () => {
    const s = servidor([json({ id: "p-novo" }, 201), json({ id: "p-novo", status: "pendente", linkPagamento: "https://pag" })]);
    const d = await executarMatricula({ nova, alteracoes: {}, planoId: "pl1" }, s.buscar);
    expect(d).toMatchObject({ tipo: "registrada", personId: "p-novo", dados: { linkPagamento: "https://pag" } });
    expect(s.chamadas.map((c) => c.metodo)).toEqual(["POST", "PATCH"]);
    expect(s.chamadas[1].corpo).toEqual({ acao: "matricular", planoId: "pl1" });
  });

  test("POST confirmado e matrícula recusada: guarda o id e o próximo clique não cria outra pessoa", async () => {
    const s = servidor([json({ id: "p-novo" }, 201), json({ erro: "Falha ao criar assinatura no Asaas" }, 502)]);
    const d1 = await executarMatricula({ nova, alteracoes: {}, planoId: "pl1" }, s.buscar);
    expect(d1).toMatchObject({ tipo: "falha-matricula", personId: "p-novo", pessoaCriadaAgora: true });
    const guardado = idParaGuardar(d1);

    const s2 = servidor([json({ id: "p-novo", status: "pendente" })]);
    const d2 = await executarMatricula({ nova, idConfirmado: guardado, alteracoes: {}, planoId: "pl1" }, s2.buscar);
    expect(d2.tipo).toBe("registrada");
    expect(s2.chamadas.map((c) => c.metodo)).toEqual(["PATCH"]); // nada de POST de novo
  });

  test("POST sem resposta: desconhecido, e a matrícula nem é tentada", async () => {
    const s = servidor([rede()]);
    const d = await executarMatricula({ nova, alteracoes: {}, planoId: "pl1" }, s.buscar);
    expect(d).toEqual({ tipo: "desconhecido-cadastro" });
    expect(s.chamadas).toHaveLength(1);
  });

  test("POST recusado (400): falha de cadastro, sem PATCH", async () => {
    const s = servidor([json({ erro: "Nome é obrigatório" }, 400)]);
    const d = await executarMatricula({ nova, alteracoes: {}, planoId: "pl1" }, s.buscar);
    expect(d).toEqual({ tipo: "falha-cadastro", erro: "Nome é obrigatório" });
    expect(s.chamadas).toHaveLength(1);
  });
});

describe("matrícula de lead existente", () => {
  test("só as alterações vão no PATCH", async () => {
    const s = servidor([json({ id: "lead1", status: "pendente" })]);
    await executarMatricula({ pessoaId: "lead1", alteracoes: { cpf: "12345678909" }, planoId: "pl1" }, s.buscar);
    expect(s.chamadas[0].corpo).toEqual({ acao: "matricular", planoId: "pl1", cpf: "12345678909" });
  });

  test("5xx sem explicação, rede e JSON fora do combinado: nunca viram sucesso", async () => {
    for (const r of [html500(), rede(), json({ ok: true })]) {
      const s = servidor([r]);
      const d = await executarMatricula({ pessoaId: "lead1", alteracoes: {}, planoId: "pl1" }, s.buscar);
      expect(d).toEqual({ tipo: "desconhecido-matricula", personId: "lead1" });
    }
  });

  test("4xx: falha conhecida, sem dizer que a pessoa foi criada agora", async () => {
    const s = servidor([json({ erro: "Pessoa ou plano não encontrado" }, 404)]);
    const d = await executarMatricula({ pessoaId: "lead1", alteracoes: {}, planoId: "pl1" }, s.buscar);
    expect(d).toMatchObject({ tipo: "falha-matricula", pessoaCriadaAgora: false });
  });
});
