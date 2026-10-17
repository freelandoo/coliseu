import { describe, expect, it } from "vitest";
import {
  ABAS_COBRANCA,
  SECOES_ALUNOS,
  SECOES_FIDELIDADE,
  comParametro,
  destinoAtivo,
  gruposVisiveis,
  idSeguro,
  lerEnum,
  migalhas,
  retornoDaFicha,
  secaoAtiva,
} from "./navegacao";
import { modulosDoPapel } from "@/lib/auth/modulos";

const hrefs = (papel: "ADMIN" | "RECEPCAO" | "TECNICO", dev = false) =>
  gruposVisiveis(papel, dev).flatMap((g) => g.itens.map((i) => i.href));

describe("visibilidade do menu", () => {
  it("cada papel vê exatamente os seus módulos + a própria conta", () => {
    for (const papel of ["ADMIN", "RECEPCAO", "TECNICO"] as const) {
      const esperado = [...modulosDoPapel(papel).map((m) => `/${m}`), "/perfil"].sort();
      expect(hrefs(papel).sort()).toEqual(esperado);
    }
  });

  it("backup só com a flag desenvolvedor — nem o ADMIN vê sem ela", () => {
    expect(hrefs("ADMIN")).not.toContain("/backup");
    expect(hrefs("TECNICO", true)).toContain("/backup");
  });

  it("grupo sem destino some (técnico não vê Relacionamento nem Gestão)", () => {
    expect(gruposVisiveis("TECNICO", false).map((g) => g.id)).toEqual(["operacao", "conta"]);
  });
});

describe("item ativo", () => {
  it("subrotas e ficha acendem o módulo certo", () => {
    expect(destinoAtivo("/matriculados/abc123")?.rotulo).toBe("Alunos");
    expect(destinoAtivo("/matriculados/fidelidade/indicadores")?.rotulo).toBe("Alunos");
    expect(destinoAtivo("/atendimento/uso")?.rotulo).toBe("Atendimento");
    expect(destinoAtivo("/captacao/atendimento")?.rotulo).toBe("Captação");
    expect(destinoAtivo("/perfilx")).toBeNull();
  });

  it("subnavegação de Alunos tem uma aba ativa só, e nenhuma na ficha", () => {
    expect(secaoAtiva("/matriculados", SECOES_ALUNOS)).toBe("/matriculados");
    expect(secaoAtiva("/matriculados/renovar", SECOES_ALUNOS)).toBe("/matriculados/renovar");
    expect(secaoAtiva("/matriculados/fidelidade/indicadores", SECOES_ALUNOS)).toBe(
      "/matriculados/fidelidade",
    );
    expect(secaoAtiva("/matriculados/abc123", SECOES_ALUNOS)).toBeNull();
  });

  it("fidelidade: indicadores não acende tempo de casa", () => {
    expect(secaoAtiva("/matriculados/fidelidade/indicadores", SECOES_FIDELIDADE)).toBe(
      "/matriculados/fidelidade/indicadores",
    );
    expect(secaoAtiva("/matriculados/fidelidade", SECOES_FIDELIDADE)).toBe(
      "/matriculados/fidelidade",
    );
  });
});

describe("migalhas", () => {
  it("raiz do módulo não vira link para si mesma", () => {
    expect(migalhas("/cobranca")).toEqual([{ rotulo: "Cobrança" }]);
  });
  it("ficha e subrotas", () => {
    expect(migalhas("/matriculados/xyz").map((m) => m.rotulo)).toEqual(["Alunos", "Ficha"]);
    expect(migalhas("/matriculados/fidelidade/indicadores").map((m) => m.rotulo)).toEqual([
      "Alunos",
      "Fidelidade",
      "Indicadores",
    ]);
  });
});

describe("parâmetros", () => {
  it("enum inválido cai no padrão", () => {
    expect(lerEnum("planos", ABAS_COBRANCA, "cobrancas")).toBe("planos");
    expect(lerEnum("PLANOS", ABAS_COBRANCA, "cobrancas")).toBe("cobrancas");
    expect(lerEnum("<script>", ABAS_COBRANCA, "cobrancas")).toBe("cobrancas");
    expect(lerEnum(null, ABAS_COBRANCA, "cobrancas")).toBe("cobrancas");
  });

  it("id opaco: só caracteres seguros e tamanho limitado", () => {
    expect(idSeguro("cmf1abc_-9")).toBe("cmf1abc_-9");
    expect(idSeguro("../x")).toBeNull();
    expect(idSeguro("https://evil.com")).toBeNull();
    expect(idSeguro("a".repeat(65))).toBeNull();
  });

  it("trocar um parâmetro preserva os outros e o padrão limpa a URL", () => {
    expect(comParametro("c=1&x=2", "aba", "planos", "cobrancas")).toBe("?c=1&x=2&aba=planos");
    expect(comParametro("aba=planos&c=1", "aba", "cobrancas", "cobrancas")).toBe("?c=1");
    expect(comParametro("aba=planos", "aba", null)).toBe("");
  });
});

describe("retorno da ficha", () => {
  it("origem desconhecida ou URL cai na lista de alunos", () => {
    expect(retornoDaFicha("https://evil.com", null, "ADMIN").href).toBe("/matriculados");
    expect(retornoDaFicha(undefined, null, "RECEPCAO").href).toBe("/matriculados");
  });

  it("atendimento volta para a conversa, com id validado", () => {
    expect(retornoDaFicha("atendimento", "c123", "RECEPCAO").href).toBe("/atendimento?c=c123");
    expect(retornoDaFicha("atendimento", "x&y=1", "RECEPCAO").href).toBe("/atendimento");
  });

  it("captação, retenção e fidelidade voltam para a própria tela", () => {
    expect(retornoDaFicha("captacao", null, "RECEPCAO")).toMatchObject({ href: "/captacao", origem: "captacao" });
    expect(retornoDaFicha("retencao", null, "ADMIN").href).toBe("/matriculados/retencao");
    expect(retornoDaFicha("fidelidade", null, "ADMIN").href).toBe("/matriculados/fidelidade");
  });

  it("origem nova não aceita destino montado pela URL", () => {
    expect(retornoDaFicha("captacao", "https://evil.com", "ADMIN").href).toBe("/captacao");
    expect(retornoDaFicha("/captacao", null, "ADMIN").href).toBe("/matriculados");
  });

  it("técnico sem os módulos cai no padrão", () => {
    expect(retornoDaFicha("captacao", null, "TECNICO").origem).toBe("alunos");
    expect(retornoDaFicha("retencao", null, "TECNICO").origem).toBe("alunos");
  });

  it("sem o módulo de destino, não oferece a volta para ele", () => {
    expect(retornoDaFicha("vencimentos", null, "RECEPCAO").href).toBe("/matriculados");
    expect(retornoDaFicha("vencimentos", null, "ADMIN").href).toBe("/cobranca?aba=vencimentos");
  });
});
