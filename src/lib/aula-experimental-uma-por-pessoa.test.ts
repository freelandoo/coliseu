import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  horaDaPlanilha,
  mensagemLembreteAula,
  presencaDaPlanilha,
  primeiroNomeChave,
  situacaoAnterior,
} from "@/lib/aula-experimental";
import {
  aulasAnterioresRepo,
  criarAulaExperimentalRepo,
  diasUsados,
  esgotouAulas,
  type AulaAnterior,
} from "@/lib/repositories/aulas-experimentais";
import { conferirAulaNova } from "@/lib/aula-experimental-regra";
import { enviarLembretesAula } from "@/lib/aula-experimental-lembrete";

describe("regras puras", () => {
  it("primeiro nome sem acento e minúsculo", () => {
    expect(primeiroNomeChave("  João Victor ")).toBe("joao");
    expect(primeiroNomeChave("Fabio Pascoal / Eliane")).toBe("fabio");
  });

  it("situação de uma aula anterior", () => {
    const hoje = "2026-10-27";
    expect(situacaoAnterior({ data: "2026-10-01", presenca: null }, hoje)).toBe("fez");
    expect(situacaoAnterior({ data: "2026-10-01", presenca: "faltou" }, hoje)).toBe("faltou");
    expect(situacaoAnterior({ data: "2026-11-01", presenca: null }, hoje)).toBe("marcada");
    expect(situacaoAnterior({ data: null, presenca: null }, hoje)).toBeNull();
  });

  it("status e horário escritos à mão na planilha", () => {
    expect(presencaDaPlanilha("Aula Ok")).toBe("veio");
    expect(presencaDaPlanilha("Veio")).toBe("veio");
    expect(presencaDaPlanilha("Não veio")).toBe("faltou");
    expect(presencaDaPlanilha("Faltou")).toBe("faltou");
    expect(presencaDaPlanilha("reagendar")).toBe("faltou");
    expect(presencaDaPlanilha("*")).toBeNull();
    expect(horaDaPlanilha("19h")).toBe(19);
    expect(horaDaPlanilha("09h")).toBe(9);
    expect(horaDaPlanilha("10:30")).toBe(10);
    expect(horaDaPlanilha("*")).toBeNull();
  });

  it("lembrete fala amanhã/hoje", () => {
    const t = mensagemLembreteAula({ nome: "MARIA silva", modalidade: "Boxe", data: "2026-10-28", hora: 19, hoje: "2026-10-27" });
    expect(t).toContain("Olá, Maria!");
    expect(t).toContain("de Boxe amanhã, 28/10, às 19h");
    expect(mensagemLembreteAula({ nome: "Ana", modalidade: "Boxe", data: "2026-10-27", hora: 19, hoje: "2026-10-27" })).toContain(
      "hoje",
    );
  });
});

describe("até 3 dias de aula por pessoa", () => {
  const aula = (data: string, situacao: AulaAnterior["situacao"]): AulaAnterior => ({
    origem: "sistema", nome: "Ana", data, hora: 18, modalidade: "Boxe", situacao, porque: "cpf",
  });

  it("conta os dias que fez e os marcados; falta não conta; mesmo dia conta uma vez", () => {
    const duas = [aula("2026-10-20", "fez"), aula("2026-10-29", "marcada")];
    expect(esgotouAulas(duas)).toBeNull();
    expect(esgotouAulas([...duas, aula("2026-10-10", "faltou")])).toBeNull();
    expect(diasUsados([...duas, aula("2026-10-20", "fez")])).toHaveLength(2);
    expect(esgotouAulas([...duas, aula("2026-10-25", "fez")])).toHaveLength(3);
  });
});

describe("limite de aula experimental por pessoa (banco de teste)", () => {
  const k = String(Date.now()).slice(-8);
  const cel = `119${k}`;

  it("planilha: casa por telefone + primeiro nome; mesmo telefone com outro nome é outra pessoa", async () => {
    await prisma.aulaExperimentalLegado.createMany({
      data: [
        { aba: `t${k}`, linha: 1, nome: "Leandro Dias", telefone: cel, dataAula: "2026-08-01", presenca: "veio" },
        { aba: `t${k}`, linha: 2, nome: "Noah Dias", telefone: cel, dataAula: "2026-08-01", presenca: "faltou" },
      ],
    });
    const hoje = "2026-10-27";
    expect(diasUsados(await aulasAnterioresRepo({ telefone: `(11) 9${k.slice(0, 4)}-${k.slice(4)}`, nome: "leandro" }, hoje))).toHaveLength(1);
    // Noah faltou: pode marcar.
    const noah = await aulasAnterioresRepo({ telefone: cel, nome: "Noah" }, hoje);
    expect(noah.map((a) => a.situacao)).toEqual(["faltou"]);
    expect(diasUsados(noah)).toHaveLength(0);
    // Mesmo número, nome que não está na planilha.
    expect(await aulasAnterioresRepo({ telefone: cel, nome: "Maria" }, hoje)).toEqual([]);
  });

  it("sistema: CPF casa mesmo com outro telefone; conferirAulaNova recusa CPF inválido e quem usou os 3 dias", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const cpf = "52998224725"; // CPF de exemplo válido
    await prisma.aulaExperimental.deleteMany({ where: { cpf } });
    const marcar = (data: string) =>
      criarAulaExperimentalRepo({
        conversaId: null, personId: null, nome: "Pessoa Cpf", telefone: "11900000001",
        modalidade: "Boxe", data, hora: 18, agendadoPorId: user.id, cpf,
      });
    await marcar("2020-01-01");
    await marcar("2020-01-02");
    // 2 dias usados: ainda pode o 3º.
    expect((await conferirAulaNova({ cpf, telefone: null, nome: null })).ok).toBe(true);
    await marcar("2020-01-03");
    expect((await conferirAulaNova({ cpf: "123", telefone: null, nome: null })).ok).toBe(false);
    const c = await conferirAulaNova({ cpf: "529.982.247-25", telefone: "11955555555", nome: "Outro Nome" });
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.status).toBe(409);
    // ADMIN pode liberar; recepção não.
    expect((await conferirAulaNova({ cpf, telefone: null, nome: null, forcar: true, papel: "ADMIN" })).ok).toBe(true);
    expect((await conferirAulaNova({ cpf, telefone: null, nome: null, forcar: true, papel: "RECEPCAO" })).ok).toBe(false);
    await prisma.aulaExperimental.deleteMany({ where: { cpf } });
  });

  it("lembrete: fora da janela não faz nada; na janela, sem WhatsApp configurado, registra o motivo", async () => {
    const user = await prisma.user.findFirstOrThrow();
    // 27/10/2026 às 03h em SP (06h UTC) = fora da janela; 15h em SP (18h UTC) = dentro.
    const madrugada = new Date("2026-10-27T06:00:00Z");
    const tarde = new Date("2026-10-27T18:00:00Z");
    const aula = await criarAulaExperimentalRepo({
      conversaId: null, personId: null, nome: "Lembrete Teste", telefone: `119${k}`,
      modalidade: "Boxe", data: "2026-10-28", hora: 19, agendadoPorId: user.id, cpf: null,
    });
    try {
      expect((await enviarLembretesAula(madrugada)).candidatas).toBe(0);
      const r = await enviarLembretesAula(tarde);
      expect(r.candidatas).toBeGreaterThanOrEqual(1);
      const depois = await prisma.aulaExperimental.findUniqueOrThrow({ where: { id: aula.id } });
      expect(depois.lembreteEnviadoEm).toBeNull();
      expect(depois.lembreteErro).toBeTruthy();
    } finally {
      await prisma.aulaExperimental.delete({ where: { id: aula.id } });
    }
  });
});
