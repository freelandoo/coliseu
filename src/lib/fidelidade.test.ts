import { expect, test } from "vitest";
import { HOJE } from "@/lib/mock-data";
import type { Aluno } from "@/lib/types";
import {
  churnEstimado,
  janelaReativacao,
  ltvMedio,
  mesesAteSair,
  mesesDeCasa,
  mixFidelidade,
  pontoDeEvasao,
  retencaoPorCoorte,
} from "@/lib/fidelidade";

const iso = (dias: number) => new Date(HOJE.getTime() + dias * 86_400_000).toISOString();

function aluno(p: Partial<Aluno> & { matric: number; pres: number; status: Aluno["status"] }): Aluno {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    codigo: p.codigo ?? "CDX",
    nome: p.nome ?? "Teste",
    telefone: "", email: "", cpf: "",
    planoId: p.planoId ?? "p-mensal",
    status: p.status,
    matriculadoEm: iso(p.matric),
    vencimentoPlano: iso(p.matric + 30),
    ultimaPresenca: iso(p.pres),
  };
}

const base: Aluno[] = [
  aluno({ status: "ativo", matric: -730, pres: -1 }), // veterano (24m)
  aluno({ status: "ativo", matric: -200, pres: -1 }), // fiel (~7m)
  aluno({ status: "ativo", matric: -20, pres: -20 }), // novato ausente
  aluno({ status: "cancelado", matric: -60, pres: -40 }), // ficou ~20d, saiu há ~40d
  aluno({ status: "cancelado", matric: -400, pres: -250 }), // ficou ~5m, saiu há ~8m
];

test("mesesDeCasa e mesesAteSair", () => {
  expect(mesesDeCasa(base[0])).toBe(24);
  expect(mesesAteSair(base[4])).toBe(5); // (400-250)/30 = 5
});

test("pontoDeEvasao conta só cancelados e acha o pico", () => {
  const r = pontoDeEvasao(base);
  expect(r.total).toBe(2);
  expect(r.dist.reduce((s, d) => s + d.count, 0)).toBe(2);
  expect(r.mediaMeses).toBeGreaterThan(0);
});

test("retencaoPorCoorte fica entre 0 e 100", () => {
  const linhas = retencaoPorCoorte(base);
  for (const l of linhas) expect(l.pct).toBeGreaterThanOrEqual(0), expect(l.pct).toBeLessThanOrEqual(100);
  const somaTotais = linhas.reduce((s, l) => s + l.total, 0);
  expect(somaTotais).toBe(base.length);
});

test("mixFidelidade soma os ativos", () => {
  const mix = mixFidelidade(base);
  expect(mix.reduce((s, m) => s + m.count, 0)).toBe(3); // 3 ativos
});

test("janelaReativacao classifica os cancelados", () => {
  const j = janelaReativacao(base);
  expect(j.total).toBe(2);
  expect(j.recentes.length + j.mornos.length + j.frios.length).toBe(2);
});

test("ltvMedio usa vida média dos cancelados", () => {
  const r = ltvMedio(base, () => 100);
  expect(r.ticketMedio).toBe(100);
  expect(r.baseadoEm).toBe("cancelados");
  expect(r.ltv).toBeGreaterThan(0);
});

test("churnEstimado calcula percentuais", () => {
  const c = churnEstimado(base);
  expect(c.mensalPct).toBeGreaterThanOrEqual(0);
  expect(c.anualPct).toBeGreaterThanOrEqual(c.mensalPct);
});
