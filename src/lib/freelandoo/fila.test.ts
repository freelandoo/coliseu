import { describe, expect, test, vi } from "vitest";
import type { FreelandooEstado, TarefaFreelandooTipo } from "@prisma/client";
import {
  MAX_TENTATIVAS,
  processarFila,
  type DepsFila,
  type PessoaFila,
  type RepoFila,
  type TarefaLote,
} from "@/lib/freelandoo/fila";
import { clienteNaoConfigurado, type ClienteFreelandoo } from "@/lib/freelandoo/cliente";
import type { Elegibilidade } from "@/lib/freelandoo/elegibilidade";
import type { CamposFreelandoo } from "@/lib/freelandoo/situacao";
import type { ResultadoBoasVindas } from "@/lib/freelandoo/boas-vindas";
import { chaveTarefa } from "@/lib/freelandoo/tarefas";

/**
 * Fila sem banco e sem rede: repositório em memória e cliente falso.
 * Cobre retentativa, limite de 10, dedupe, parada por chave inválida e as
 * transições de estado da pessoa.
 */

type Tarefa = TarefaLote & { status: "PENDENTE" | "EM_ANDAMENTO" | "OK" | "FALHOU"; proximaEm: Date; erro: string | null; dedupe: string };
type Pessoa = PessoaFila & CamposFreelandoo;

const DADOS = {
  cpf: "52998224725", nome: "Maria Souza", email: "m@x.com", data_nascimento: "1990-07-30",
  telefone: "5511988887777", ref_externa: "p1",
};

class RepoMemoria implements RepoFila {
  tarefas: Tarefa[] = [];
  pessoas = new Map<string, Pessoa>();
  chave: "invalida" | "ok" = "ok";
  notificacoes: { tipo: string; erro: string }[] = [];
  elegibilidade: Elegibilidade = { elegivel: true, dados: DADOS };
  private seq = 0;

  constructor(pessoas: Pessoa[] = [{ id: "p1", nome: "Maria Souza", freelandooUserId: null, freelandooEstado: "sem_conta" }]) {
    for (const p of pessoas) this.pessoas.set(p.id, { ...p });
  }

  add(tipo: TarefaFreelandooTipo, payload: unknown = null, personId = "p1", agora = new Date(0)) {
    return this.enfileirarSync(personId, tipo, payload, agora);
  }

  private enfileirarSync(personId: string, tipo: TarefaFreelandooTipo, payload: unknown, agora: Date) {
    const dedupe = `${tipo}:${personId}`;
    const t = this.tarefas.find((x) => x.dedupe === dedupe);
    if (!t) {
      const nova: Tarefa = { id: `t${++this.seq}`, personId, tipo, tentativas: 0, payload, status: "PENDENTE", proximaEm: agora, erro: null, dedupe };
      this.tarefas.push(nova);
      return nova;
    }
    if (t.status === "OK" || t.status === "FALHOU") Object.assign(t, { status: "PENDENTE", tentativas: 0, proximaEm: agora, erro: null });
    if (payload !== undefined && t.status === "PENDENTE") t.payload = payload;
    return t;
  }

  async recuperarPresas(antesDe: Date) {
    for (const t of this.tarefas) if (t.status === "EM_ANDAMENTO" && t.proximaEm < antesDe) t.status = "PENDENTE";
  }
  async pegarLote(agora: Date, limite: number) {
    const lote = this.tarefas.filter((t) => t.status === "PENDENTE" && t.proximaEm <= agora).slice(0, limite);
    for (const t of lote) Object.assign(t, { status: "EM_ANDAMENTO", proximaEm: agora });
    return lote.map((t) => ({ ...t }));
  }
  async concluir(id: string) {
    Object.assign(this.t(id), { status: "OK", payload: null, erro: null });
  }
  async reagendar(id: string, d: { tentativas: number; proximaEm: Date; erro: string | null }) {
    Object.assign(this.t(id), { status: "PENDENTE", tentativas: d.tentativas, proximaEm: d.proximaEm, erro: d.erro });
  }
  async falhar(id: string, d: { tentativas: number; erro: string }) {
    Object.assign(this.t(id), { status: "FALHOU", tentativas: d.tentativas, erro: d.erro });
  }
  async devolver(ids: string[]) {
    for (const id of ids) if (this.t(id).status === "EM_ANDAMENTO") this.t(id).status = "PENDENTE";
  }
  async pessoa(id: string) {
    return this.pessoas.get(id) ?? null;
  }
  async avaliar(id: string) {
    const p = this.pessoas.get(id);
    return p ? { pessoa: p, elegibilidade: this.elegibilidade } : null;
  }
  async atualizarPessoa(id: string, campos: CamposFreelandoo) {
    Object.assign(this.pessoas.get(id)!, campos);
  }
  async enfileirar(personId: string, tipo: TarefaFreelandooTipo, payload?: unknown) {
    this.enfileirarSync(personId, tipo, payload, new Date(0));
  }
  async anteciparFotos(personId: string, agora: Date) {
    for (const t of this.tarefas) {
      if (t.personId === personId && t.tipo === "ENVIAR_FOTO" && t.status === "PENDENTE" && t.proximaEm > agora) t.proximaEm = agora;
    }
  }
  async marcarChave(s: "invalida" | "ok") {
    this.chave = s;
  }
  async notificarFalha(_p: { id: string; nome: string }, tipo: TarefaFreelandooTipo, erro: string) {
    this.notificacoes.push({ tipo, erro });
  }
  t(id: string) {
    return this.tarefas.find((x) => x.id === id)!;
  }
  porTipo(tipo: TarefaFreelandooTipo) {
    return this.tarefas.find((x) => x.tipo === tipo);
  }
}

function clienteFalso(sobrescrever: Partial<ClienteFreelandoo> = {}): ClienteFreelandoo {
  return {
    ...clienteNaoConfigurado,
    criarMembro: vi.fn(async () => ({
      ok: true as const,
      dados: { status: "criado" as const, id_user: "u1", estado: "aguardando_aceite" as const, link_primeiro_acesso: "https://fl/l/abc", expira_em: "2026-10-27" },
    })),
    ...sobrescrever,
  };
}

function deps(repo: RepoMemoria, extra: Partial<DepsFila> = {}, agora = new Date("2026-10-20T12:00:00Z")): DepsFila {
  return {
    repo,
    cliente: clienteFalso(),
    enviarBoasVindas: vi.fn(async (): Promise<ResultadoBoasVindas> => ({ tipo: "enviado", waMessageId: "wa1" })),
    agora: () => agora,
    configurado: true,
    ...extra,
  };
}

const p1 = (repo: RepoMemoria) => repo.pessoas.get("p1")!;

describe("CRIAR_ACESSO", () => {
  test("criado: grava vínculo, aguardando aceite, e enfileira as boas-vindas com o link", async () => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    const r = await processarFila(deps(repo));
    expect(r).toMatchObject({ processadas: 1, ok: 1 });
    expect(p1(repo)).toMatchObject({ freelandooUserId: "u1", freelandooEstado: "aguardando_aceite" });
    expect(repo.porTipo("CRIAR_ACESSO")!.status).toBe("OK");
    expect(repo.porTipo("ENVIAR_BOAS_VINDAS")).toMatchObject({ status: "PENDENTE", payload: { link: "https://fl/l/abc" } });
  });

  test("vinculado: só liga a conta, sem mensagem", async () => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    const cliente = clienteFalso({
      criarMembro: async () => ({ ok: true, dados: { status: "vinculado", id_user: "u7", estado: "ativa" } }),
    });
    await processarFila(deps(repo, { cliente }));
    expect(p1(repo)).toMatchObject({ freelandooUserId: "u7", freelandooEstado: "ativa" });
    expect(repo.porTipo("ENVIAR_BOAS_VINDAS")).toBeUndefined();
  });

  test.each([
    ["email_em_uso", "conflito_email"],
    ["cpf_invalido", "falta_dado"],
    ["dados_incompletos", "falta_dado"],
    ["menor_de_idade", "menor"],
  ] as const)("%s: estado %s e sem retentativa", async (erro, estado) => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    const cliente = clienteFalso({ criarMembro: async () => ({ ok: false, erro }) });
    await processarFila(deps(repo, { cliente }));
    expect(p1(repo).freelandooEstado).toBe<FreelandooEstado>(estado);
    expect(repo.porTipo("CRIAR_ACESSO")!.status).toBe("FALHOU");
    expect(repo.notificacoes).toEqual([]); // dado ruim não é alarme
  });

  test("cadastro mudou e ficou inelegível: registra o motivo e encerra sem chamar a API", async () => {
    const repo = new RepoMemoria();
    repo.elegibilidade = { elegivel: false, motivo: "falta_email", estado: "falta_dado" };
    repo.add("CRIAR_ACESSO");
    const cliente = clienteFalso();
    await processarFila(deps(repo, { cliente }));
    expect(cliente.criarMembro).not.toHaveBeenCalled();
    expect(p1(repo)).toMatchObject({ freelandooEstado: "falta_dado", freelandooMotivo: "falta_email" });
    expect(repo.porTipo("CRIAR_ACESSO")!.status).toBe("OK");
  });

  test("conta criada antecipa a foto que estava esperando", async () => {
    const repo = new RepoMemoria();
    const foto = repo.add("ENVIAR_FOTO", { imagem: "AAAA" }, "p1", new Date("2026-10-20T13:00:00Z"));
    repo.add("CRIAR_ACESSO");
    await processarFila(deps(repo));
    expect(foto.proximaEm).toEqual(new Date("2026-10-20T12:00:00Z"));
  });
});

describe("retentativa", () => {
  test("transitório: +1 tentativa e de novo em 1 minuto", async () => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    const agora = new Date("2026-10-20T12:00:00Z");
    const cliente = clienteFalso({ criarMembro: async () => ({ ok: false, erro: "transitorio", detalhe: "HTTP 503" }) });
    const r = await processarFila(deps(repo, { cliente }, agora));
    expect(r.reagendadas).toBe(1);
    const t = repo.porTipo("CRIAR_ACESSO")!;
    expect(t).toMatchObject({ status: "PENDENTE", tentativas: 1, erro: "transitorio: HTTP 503" });
    expect(t.proximaEm).toEqual(new Date(agora.getTime() + 60_000));
  });

  test("exceção inesperada também é retentada", async () => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    const cliente = clienteFalso({ criarMembro: async () => { throw new Error("boom"); } });
    await processarFila(deps(repo, { cliente }));
    expect(repo.porTipo("CRIAR_ACESSO")).toMatchObject({ status: "PENDENTE", tentativas: 1, erro: "boom" });
  });

  test(`na ${MAX_TENTATIVAS}ª falha: FALHOU, pessoa "falhou" e aviso no sino`, async () => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    const cliente = clienteFalso({ criarMembro: async () => ({ ok: false, erro: "transitorio" }) });
    let agora = new Date("2026-10-20T12:00:00Z");
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      await processarFila(deps(repo, { cliente }, agora));
      agora = new Date(agora.getTime() + 60_000);
    }
    expect(repo.porTipo("CRIAR_ACESSO")).toMatchObject({ status: "FALHOU", tentativas: MAX_TENTATIVAS });
    expect(p1(repo).freelandooEstado).toBe("falhou");
    expect(repo.notificacoes).toHaveLength(1);
    // depois de FALHOU não roda mais
    expect((await processarFila(deps(repo, { cliente }, agora))).processadas).toBe(0);
  });

  test("tarefa presa EM_ANDAMENTO (processo caiu) volta à fila", async () => {
    const repo = new RepoMemoria();
    const t = repo.add("CRIAR_ACESSO");
    t.status = "EM_ANDAMENTO";
    t.proximaEm = new Date("2026-10-20T11:00:00Z");
    expect((await processarFila(deps(repo))).ok).toBe(1);
  });
});

describe("chave de parceiro inválida", () => {
  test("para o lote inteiro, devolve sem gastar tentativa e acende o aviso", async () => {
    const repo = new RepoMemoria([
      { id: "p1", nome: "A", freelandooUserId: null, freelandooEstado: "sem_conta" },
      { id: "p2", nome: "B", freelandooUserId: null, freelandooEstado: "sem_conta" },
    ]);
    repo.add("CRIAR_ACESSO", null, "p1");
    repo.add("CRIAR_ACESSO", null, "p2");
    const criar = vi.fn(async () => ({ ok: false as const, erro: "chave_invalida" as const }));
    const r = await processarFila(deps(repo, { cliente: clienteFalso({ criarMembro: criar }) }));
    expect(r.parouPorChave).toBe(true);
    expect(criar).toHaveBeenCalledTimes(1); // a segunda nem é tentada
    expect(repo.tarefas.every((t) => t.status === "PENDENTE" && t.tentativas === 0)).toBe(true);
    expect(repo.chave).toBe("invalida");
  });

  test("a próxima chamada aceita apaga o aviso", async () => {
    const repo = new RepoMemoria();
    repo.chave = "invalida";
    repo.add("CRIAR_ACESSO");
    await processarFila(deps(repo));
    expect(repo.chave).toBe("ok");
  });

  test("sem configuração a fila nem começa", async () => {
    const repo = new RepoMemoria();
    repo.add("CRIAR_ACESSO");
    expect((await processarFila(deps(repo, { configurado: false }))).pulou).toBe(true);
    expect(repo.porTipo("CRIAR_ACESSO")!.status).toBe("PENDENTE");
  });
});

describe("ENVIAR_BOAS_VINDAS", () => {
  const vinculada = (estado: FreelandooEstado = "aguardando_aceite") =>
    new RepoMemoria([{ id: "p1", nome: "Maria", freelandooUserId: "u1", freelandooEstado: estado }]);

  test("enviado: marca acesso enviado", async () => {
    const repo = vinculada();
    repo.add("ENVIAR_BOAS_VINDAS", { link: "https://l" });
    const d = deps(repo);
    await processarFila(d);
    expect(d.enviarBoasVindas).toHaveBeenCalledWith({ personId: "p1", link: "https://l" });
    expect(p1(repo).freelandooAcessoEnviadoEm).toEqual(d.agora());
  });

  test("sem telefone: conclui sem marcar envio (ficha mostra 'acesso não enviado')", async () => {
    const repo = vinculada();
    repo.add("ENVIAR_BOAS_VINDAS", { link: "https://l" });
    await processarFila(deps(repo, { enviarBoasVindas: async () => ({ tipo: "sem_telefone" }) }));
    expect(repo.porTipo("ENVIAR_BOAS_VINDAS")!.status).toBe("OK");
    expect(p1(repo).freelandooAcessoEnviadoEm).toBeUndefined();
  });

  test("WhatsApp desconectado é transitório", async () => {
    const repo = vinculada();
    repo.add("ENVIAR_BOAS_VINDAS", { link: "https://l" });
    await processarFila(deps(repo, {
      enviarBoasVindas: async () => ({ tipo: "falha", erro: "WhatsApp da academia desconectado", transitoria: true }),
    }));
    expect(repo.porTipo("ENVIAR_BOAS_VINDAS")).toMatchObject({ status: "PENDENTE", tentativas: 1 });
  });

  test("aluno já aceitou: não manda link velho", async () => {
    const repo = vinculada("ativa");
    repo.add("ENVIAR_BOAS_VINDAS", { link: "https://l" });
    const d = deps(repo);
    await processarFila(d);
    expect(d.enviarBoasVindas).not.toHaveBeenCalled();
  });
});

describe("REENVIAR_LINK e ENVIAR_FOTO", () => {
  test("reenviar pede link novo e põe na tarefa de boas-vindas", async () => {
    const repo = new RepoMemoria([{ id: "p1", nome: "Maria", freelandooUserId: "u1", freelandooEstado: "aguardando_aceite" }]);
    repo.add("REENVIAR_LINK");
    const cliente = clienteFalso({ novoLink: async () => ({ ok: true, dados: { link_primeiro_acesso: "https://novo", expira_em: "x" } }) });
    await processarFila(deps(repo, { cliente }));
    expect(repo.porTipo("ENVIAR_BOAS_VINDAS")).toMatchObject({ status: "PENDENTE", payload: { link: "https://novo" } });
  });

  test("reenviar com ja_aceito marca a conta ativa", async () => {
    const repo = new RepoMemoria([{ id: "p1", nome: "Maria", freelandooUserId: "u1", freelandooEstado: "aguardando_aceite" }]);
    repo.add("REENVIAR_LINK");
    await processarFila(deps(repo, { cliente: clienteFalso({ novoLink: async () => ({ ok: false, erro: "ja_aceito" }) }) }));
    expect(p1(repo).freelandooEstado).toBe("ativa");
  });

  test("foto antes da conta: adia sem gastar tentativa", async () => {
    const repo = new RepoMemoria();
    repo.add("ENVIAR_FOTO", { imagem: "/9j/AA==" });
    const enviar = vi.fn();
    await processarFila(deps(repo, { cliente: clienteFalso({ enviarFotoAcademia: enviar }) }));
    expect(enviar).not.toHaveBeenCalled();
    expect(repo.porTipo("ENVIAR_FOTO")).toMatchObject({ status: "PENDENTE", tentativas: 0 });
  });

  test("foto com conta: sobe os bytes e a imagem sai da tarefa", async () => {
    const repo = new RepoMemoria([{ id: "p1", nome: "Maria", freelandooUserId: "u1", freelandooEstado: "ativa" }]);
    repo.add("ENVIAR_FOTO", { imagem: Buffer.from([0xff, 0xd8, 0xff]).toString("base64") });
    const enviar = vi.fn(async () => ({ ok: true as const, dados: { ok: true as const } }));
    await processarFila(deps(repo, { cliente: clienteFalso({ enviarFotoAcademia: enviar }) }));
    expect(enviar).toHaveBeenCalledWith("u1", Buffer.from([0xff, 0xd8, 0xff]));
    expect(repo.porTipo("ENVIAR_FOTO")).toMatchObject({ status: "OK", payload: null });
  });
});

describe("dedupeKey (tarefas.ts)", () => {
  test("uma tarefa viva por aluno e tipo; reenvio limitado a um por minuto", () => {
    const t0 = new Date("2026-10-20T12:00:10Z");
    expect(chaveTarefa("CRIAR_ACESSO", "p1", t0)).toBe("criar:p1");
    expect(chaveTarefa("ENVIAR_BOAS_VINDAS", "p1", t0)).toBe("boas-vindas:p1");
    expect(chaveTarefa("ENVIAR_FOTO", "p1", t0)).toBe("foto:p1");
    const r1 = chaveTarefa("REENVIAR_LINK", "p1", t0);
    expect(chaveTarefa("REENVIAR_LINK", "p1", new Date("2026-10-20T12:00:50Z"))).toBe(r1);
    expect(chaveTarefa("REENVIAR_LINK", "p1", new Date("2026-10-20T12:01:00Z"))).not.toBe(r1);
  });
});
