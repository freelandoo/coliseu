import { describe, expect, test } from "vitest";
import {
  codificarCursor,
  confirmarOtimista,
  cursorDeNovidades,
  lerCursor,
  lerLimite,
  marcarOtimista,
  mesclarConversas,
  mesclarMensagens,
  resolverIncertas,
  type MensagemTela,
} from "@/lib/whatsapp/historico";
import type { ConversaResumo, MensagemItem } from "@/lib/types";

function msg(id: string, enviadaEm: string, extra: Partial<MensagemItem> = {}): MensagemItem {
  return {
    id,
    direcao: "IN",
    autor: "LEAD",
    autorNome: null,
    remetente: null,
    texto: `texto ${id}`,
    tipoMidia: "texto",
    enviadaEm,
    erro: null,
    citavel: true,
    citada: null,
    ...extra,
  };
}

function conv(id: string, ultimaMensagemEm: string, extra: Partial<ConversaResumo> = {}): ConversaResumo {
  return {
    id,
    nome: `Pessoa ${id}`,
    telefone: "",
    ehGrupo: false,
    personId: null,
    atendente: null,
    interesse: "nao_classificado",
    naoLidas: 0,
    ultimaMensagemEm,
    preview: "",
    ...extra,
  };
}

const T = (s: number) => new Date(Date.UTC(2026, 9, 17, 12, 0, s)).toISOString();

describe("cursor", () => {
  test("vai e volta sem perder data nem id", () => {
    const c = codificarCursor({ em: T(5), id: "ckx123" });
    expect(lerCursor(c)).toEqual({ em: T(5), id: "ckx123" });
  });

  test("lixo vira null — nunca chega à consulta", () => {
    expect(lerCursor(null)).toBeNull();
    expect(lerCursor("")).toBeNull();
    expect(lerCursor("sem-separador")).toBeNull();
    expect(lerCursor("não-é-data~abc")).toBeNull();
    expect(lerCursor(`${T(1)}~id com espaço`)).toBeNull();
    expect(lerCursor(`${T(1)}~a'; drop table`)).toBeNull();
  });

  test("limite respeita o teto e o padrão", () => {
    expect(lerLimite(null, 50, 200)).toBe(50);
    expect(lerLimite("10", 50, 200)).toBe(10);
    expect(lerLimite("5000", 50, 200)).toBe(200);
    expect(lerLimite("-3", 50, 200)).toBe(50);
    expect(lerLimite("abc", 50, 200)).toBe(50);
  });
});

describe("mesclarMensagens", () => {
  test("deduplica por id e ordena por (enviadaEm, id), mesmo segundo incluído", () => {
    const atual = [msg("b", T(1)), msg("d", T(2))];
    // página sobreposta: repete "b" e traz "a" e "c" no mesmo segundo de "b"
    const novas = [msg("c", T(1)), msg("a", T(1)), msg("b", T(1), { texto: "versão nova" })];
    const r = mesclarMensagens(atual, novas);
    expect(r.map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(r.find((m) => m.id === "b")?.texto).toBe("versão nova");
  });

  test("nunca descarta o que já estava carregado", () => {
    const antigas = Array.from({ length: 501 }, (_, i) => msg(`m${String(i).padStart(4, "0")}`, T(0)));
    const r = mesclarMensagens(antigas, [msg("z", T(9))]);
    expect(r).toHaveLength(502);
    expect(r[r.length - 1].id).toBe("z");
  });

  test("respostas fora de ordem (página anterior chegando depois do delta) dão o mesmo resultado", () => {
    const base = [msg("m5", T(5))];
    const anteriores = [msg("m1", T(1)), msg("m2", T(2))];
    const delta = [msg("m6", T(6)), msg("m5", T(5))];
    const umaOrdem = mesclarMensagens(mesclarMensagens(base, anteriores), delta);
    const outra = mesclarMensagens(mesclarMensagens(base, delta), anteriores);
    expect(umaOrdem.map((m) => m.id)).toEqual(["m1", "m2", "m5", "m6"]);
    expect(outra.map((m) => m.id)).toEqual(umaOrdem.map((m) => m.id));
  });

  test("bolhas otimistas ficam no fim, na ordem em que foram criadas", () => {
    const atual: MensagemTela[] = [
      msg("m1", T(1)),
      { ...msg("tmp:2", T(50)), envio: "enviando" },
      { ...msg("tmp:1", T(40)), envio: "enviando" },
    ];
    const r = mesclarMensagens(atual, [msg("m2", T(2))]);
    expect(r.map((m) => m.id)).toEqual(["m1", "m2", "tmp:2", "tmp:1"]);
  });
});

describe("confirmação de envio", () => {
  const historico: MensagemTela[] = [
    msg("m1", T(1)),
    msg("m2", T(2)),
    { ...msg("tmp:a", T(3), { direcao: "OUT", texto: "primeira" }), envio: "enviando" },
    { ...msg("tmp:b", T(4), { direcao: "OUT", texto: "segunda" }), envio: "enviando" },
  ];

  test("troca só a bolha confirmada e preserva as outras em voo e o histórico carregado", () => {
    const gravada = msg("s1", T(3), { direcao: "OUT", texto: "primeira" });
    // a página que veio na resposta é só o fim da conversa: não tem m1
    const r = confirmarOtimista(historico, "tmp:a", gravada, [msg("m2", T(2)), gravada]);
    expect(r.map((m) => m.id)).toEqual(["m1", "m2", "s1", "tmp:b"]);
  });

  test("falha conhecida marca a bolha sem apagar o texto", () => {
    const r = marcarOtimista(historico, "tmp:b", "falhou", "WhatsApp desconectado.");
    const b = r.find((m) => m.id === "tmp:b")!;
    expect(b.envio).toBe("falhou");
    expect(b.erro).toBe("WhatsApp desconectado.");
    expect(b.texto).toBe("segunda");
  });

  test("resultado desconhecido some quando a mensagem de verdade aparece", () => {
    const incerta = marcarOtimista(historico, "tmp:a", "incerto", null);
    const real = msg("s9", T(5), { direcao: "OUT", texto: "primeira" });
    const r = mesclarMensagens(incerta, [real]);
    expect(r.map((m) => m.id)).toEqual(["m1", "m2", "s9", "tmp:b"]);
  });

  test("resultado desconhecido não casa com mensagem de outro texto nem com recebida", () => {
    const incerta = marcarOtimista(historico, "tmp:a", "incerto", null);
    const outra = msg("s9", T(5), { direcao: "OUT", texto: "outra coisa" });
    const recebida = msg("s10", T(6), { direcao: "IN", texto: "primeira" });
    const r = resolverIncertas(mesclarMensagens(incerta, [outra, recebida]));
    expect(r.some((m) => m.id === "tmp:a")).toBe(true);
  });
});

describe("cursorDeNovidades", () => {
  test("recua a janela de releitura a partir da última confirmada", () => {
    const lista: MensagemTela[] = [msg("m1", T(1)), { ...msg("tmp:x", T(59)), envio: "enviando" }];
    const c = lerCursor(cursorDeNovidades(lista))!;
    expect(new Date(c.em).getTime()).toBe(new Date(T(1)).getTime() - 120_000);
  });

  test("conversa vazia não tem cursor", () => {
    expect(cursorDeNovidades([])).toBeNull();
  });
});

describe("mesclarConversas", () => {
  test("primeira página não apaga conversa carregada de páginas seguintes nem a aberta por busca", () => {
    const carregadas = Array.from({ length: 201 }, (_, i) => conv(`c${String(i).padStart(3, "0")}`, T(300 - i)));
    const pagina = carregadas.slice(0, 100).map((c) => ({ ...c }));
    pagina[50] = { ...pagina[50], naoLidas: 3 };
    const r = mesclarConversas(carregadas, pagina);
    expect(r).toHaveLength(201);
    expect(r.find((c) => c.id === "c050")?.naoLidas).toBe(3);
    expect(r.some((c) => c.id === "c200")).toBe(true);
  });

  test("conversa que recebeu mensagem sobe — fora de interação", () => {
    const atual = [conv("a", T(3)), conv("b", T(2)), conv("c", T(1))];
    const r = mesclarConversas(atual, [conv("c", T(9)), conv("a", T(3))]);
    expect(r.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  test("durante interação ninguém troca de lugar; as novas entram no fim", () => {
    const atual = [conv("a", T(3)), conv("b", T(2)), conv("c", T(1))];
    const r = mesclarConversas(atual, [conv("c", T(9), { naoLidas: 1 }), conv("n", T(10))], {
      manterOrdem: true,
    });
    expect(r.map((c) => c.id)).toEqual(["a", "b", "c", "n"]);
    expect(r[2].naoLidas).toBe(1);
  });
});
