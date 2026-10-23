import { afterEach, expect, test } from "vitest";
import { avisarRecepcao, barramentoRecepcao, JANELA_AVISO_MS, limparJanelaAvisos, type AvisoRecepcao } from "@/lib/access/avisos-recepcao";

afterEach(() => {
  limparJanelaAvisos();
  barramentoRecepcao.removeAllListeners("aviso");
});

function ouvir(): AvisoRecepcao[] {
  const recebidos: AvisoRecepcao[] = [];
  barramentoRecepcao.on("aviso", (a: AvisoRecepcao) => recebidos.push(a));
  return recebidos;
}

test("rosto desconhecido repetido no mesmo aparelho só avisa de novo depois da janela", () => {
  const recebidos = ouvir();
  const t0 = 1_000_000;
  const aviso = { tipo: "nao-identificado", deviceId: "d1", quando: "x" } as const;
  expect(avisarRecepcao(aviso, t0)).toBe(true);
  expect(avisarRecepcao(aviso, t0 + 10_000)).toBe(false);
  expect(avisarRecepcao({ ...aviso, deviceId: "d2" }, t0 + 10_000)).toBe(true);
  expect(avisarRecepcao(aviso, t0 + JANELA_AVISO_MS + 1)).toBe(true);
  expect(recebidos).toHaveLength(3);
});

test("sem matrícula: a janela é por pessoa; a foto da captura nunca é barrada", () => {
  const recebidos = ouvir();
  const t0 = 2_000_000;
  const sem = { tipo: "sem-matricula", deviceId: "d1", personId: "p1", nome: "Ana", quando: "x" } as const;
  expect(avisarRecepcao(sem, t0)).toBe(true);
  expect(avisarRecepcao(sem, t0 + 1_000)).toBe(false);
  expect(avisarRecepcao({ ...sem, personId: "p2" }, t0 + 1_000)).toBe(true);
  expect(avisarRecepcao({ tipo: "face", personId: "p1", ok: true }, t0 + 1_000)).toBe(true);
  expect(avisarRecepcao({ tipo: "face", personId: "p1", ok: true }, t0 + 1_001)).toBe(true);
  expect(recebidos.map((r) => r.tipo)).toEqual(["sem-matricula", "sem-matricula", "face", "face"]);
});
