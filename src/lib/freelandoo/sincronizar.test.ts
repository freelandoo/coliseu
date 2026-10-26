import { describe, expect, test } from "vitest";
import { sincronizarFreelandoo, type RepoSync, type Vinculado } from "@/lib/freelandoo/sincronizar";
import { clienteNaoConfigurado, type ClienteFreelandoo, type ItemMembro } from "@/lib/freelandoo/cliente";
import { camposDoItem, type CamposFreelandoo } from "@/lib/freelandoo/situacao";

const AGORA = new Date("2026-10-20T12:00:00Z");

const item = (id_user: string, extra: Partial<ItemMembro> = {}): ItemMembro => ({
  id_user, cpf: "52998224725", ref_externa: null, estado: "ativa", avatar_url: null, treino: null, ...extra,
});

class RepoSyncMemoria implements RepoSync {
  aplicados: { item: ItemMembro; campos: CamposFreelandoo }[] = [];
  limpos: string[] = [];
  chave: string | null = null;
  constructor(public lista: Vinculado[] = []) {}
  async vinculados() {
    return this.lista;
  }
  async aplicar(i: ItemMembro, campos: CamposFreelandoo) {
    this.aplicados.push({ item: i, campos });
    return true;
  }
  async limpar(ids: string[]) {
    this.limpos.push(...ids);
  }
  async marcarChave(s: "invalida" | "ok") {
    this.chave = s;
  }
}

function paginado(paginas: ItemMembro[][]): ClienteFreelandoo {
  return {
    ...clienteNaoConfigurado,
    listarMembros: async (cursor) => {
      const i = cursor ? Number(cursor) : 0;
      return { ok: true, dados: { itens: paginas[i] ?? [], proximo_cursor: i + 1 < paginas.length ? String(i + 1) : null } };
    },
  };
}

const deps = (cliente: ClienteFreelandoo, repo: RepoSync) => ({ cliente, repo, agora: () => AGORA, configurado: true });
const visto = (id: string, userId: string): Vinculado => ({ id, freelandooUserId: userId, freelandooSincronizadoEm: new Date(0) });

describe("sincronizarFreelandoo", () => {
  test("percorre todas as páginas e aplica cada membro", async () => {
    const repo = new RepoSyncMemoria();
    const r = await sincronizarFreelandoo(deps(paginado([[item("u1")], [item("u2")]]), repo));
    expect(r).toMatchObject({ ok: true, itens: 2, atualizados: 2, apagados: 0 });
    expect(repo.aplicados.map((a) => a.item.id_user)).toEqual(["u1", "u2"]);
    expect(repo.chave).toBe("ok");
  });

  test("vínculo que sumiu da listagem completa = conta apagada → sem conta", async () => {
    const repo = new RepoSyncMemoria([visto("p1", "u1"), visto("p2", "u2")]);
    const r = await sincronizarFreelandoo(deps(paginado([[item("u1")]]), repo));
    expect(r.apagados).toBe(1);
    expect(repo.limpos).toEqual(["p2"]);
  });

  test("vínculo recém-criado (nunca visto numa listagem) não é apagado", async () => {
    const repo = new RepoSyncMemoria([{ id: "p9", freelandooUserId: "u9", freelandooSincronizadoEm: null }]);
    await sincronizarFreelandoo(deps(paginado([[item("u1")]]), repo));
    expect(repo.limpos).toEqual([]);
  });

  test("listagem vazia com muitos vínculos locais: desconfia e não apaga ninguém", async () => {
    const repo = new RepoSyncMemoria(["a", "b", "c", "d", "e"].map((x) => visto(x, `u${x}`)));
    const r = await sincronizarFreelandoo(deps(paginado([[]]), repo));
    expect(r.ok).toBe(true);
    expect(repo.limpos).toEqual([]);
  });

  test("falha no meio da listagem: não apaga nada e mantém a cópia", async () => {
    const repo = new RepoSyncMemoria([visto("p1", "u1")]);
    const cliente: ClienteFreelandoo = {
      ...clienteNaoConfigurado,
      listarMembros: async (cursor) =>
        cursor ? { ok: false, erro: "transitorio" } : { ok: true, dados: { itens: [], proximo_cursor: "1" } },
    };
    const r = await sincronizarFreelandoo(deps(cliente, repo));
    expect(r).toMatchObject({ ok: false, erro: "transitorio" });
    expect(repo.limpos).toEqual([]);
    expect(repo.aplicados).toEqual([]);
  });

  test("chave inválida acende o aviso", async () => {
    const repo = new RepoSyncMemoria();
    const cliente: ClienteFreelandoo = { ...clienteNaoConfigurado, listarMembros: async () => ({ ok: false, erro: "chave_invalida" }) };
    await sincronizarFreelandoo(deps(cliente, repo));
    expect(repo.chave).toBe("invalida");
  });

  test("sem configuração não faz nada", async () => {
    const r = await sincronizarFreelandoo({ ...deps(clienteNaoConfigurado, new RepoSyncMemoria()), configurado: false });
    expect(r).toMatchObject({ ok: false, erro: "nao_configurado" });
  });
});

describe("camposDoItem", () => {
  test("treino, foto e estado viram a cópia local", () => {
    const c = camposDoItem(
      item("42", {
        estado: "aguardando_aceite", avatar_url: "https://r2/x.jpg",
        treino: { nome: "Hipertrofia A", criado_em: "2026-09-01", validade_dias: 60, vence_em: "2026-10-31T00:00:00Z" },
      }),
      AGORA,
    );
    expect(c).toEqual({
      freelandooUserId: "42", freelandooEstado: "aguardando_aceite", freelandooMotivo: null,
      freelandooFotoUrl: "https://r2/x.jpg", freelandooTreinoNome: "Hipertrofia A",
      freelandooTreinoVenceEm: new Date("2026-10-31T00:00:00Z"), freelandooTreinoValidadeDias: 60,
      freelandooTreinoPropostaPendente: false, freelandooSincronizadoEm: AGORA,
    });
  });

  test("ficha do professor esperando o aluno vira a marca da aba Treinos", () => {
    expect(camposDoItem(item("7", { proposta_treino_pendente: true }), AGORA).freelandooTreinoPropostaPendente).toBe(true);
  });

  test("sem treino zera os campos do treino", () => {
    expect(camposDoItem(item("1"), AGORA)).toMatchObject({
      freelandooTreinoNome: null, freelandooTreinoVenceEm: null, freelandooTreinoValidadeDias: null,
    });
  });
});
