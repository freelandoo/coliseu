import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * Teste de arquitetura do envio automático (decisão Q4, 2026-10-20).
 *
 * A regra do Coliseu é que nada sai no WhatsApp sozinho. Exceções, cada uma
 * presa num módulo só e chamada só pelo agendador:
 * - boas-vindas da Freelandoo (link de primeiro acesso), em
 *   `lib/freelandoo/boas-vindas.ts` — quem cria a conta só enfileira;
 * - lembrete da aula experimental na véspera (pedido do Alex, 26/10/2026), em
 *   `lib/aula-experimental-lembrete.ts`.
 *
 * Mesma técnica do `lib/whatsapp/sem-automacao.test.ts`: fecho transitivo dos
 * imports estáticos `@/…`. Se um destes casos falhar, alguém abriu um caminho
 * novo até o envio — pode ser legítimo, mas é decisão de produto.
 */

const RAIZ = resolve(__dirname, "../..");
const MODULO_DE_ENVIO = "@/lib/whatsapp/evolution";
const BOAS_VINDAS = "@/lib/freelandoo/boas-vindas";
const LEMBRETE_AULA = "@/lib/aula-experimental-lembrete";
const PORTAS = [BOAS_VINDAS, LEMBRETE_AULA];

function arquivoDe(especificador: string): string | null {
  if (!especificador.startsWith("@/")) return null; // dependência externa
  const base = resolve(RAIZ, especificador.slice(2));
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

function importsDe(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, "utf8");
  return [...fonte.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Fecho transitivo; `semEntrarEm` corta a busca nesses módulos (conta o import, não desce). */
function alcancaveis(entrada: string, semEntrarEm: string[] = []): Set<string> {
  const vistos = new Set<string>();
  const fila = [entrada];
  while (fila.length) {
    const atual = fila.pop()!;
    for (const especificador of importsDe(atual)) {
      if (vistos.has(especificador)) continue;
      vistos.add(especificador);
      if (semEntrarEm.includes(especificador)) continue;
      const arquivo = arquivoDe(especificador);
      if (arquivo) fila.push(arquivo);
    }
  }
  return vistos;
}

function modulosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return modulosDe(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const rel = (arquivo: string) => relative(RAIZ, arquivo).split("\\").join("/");

describe("a catraca só enfileira", () => {
  test("a ingestão de eventos do agente não alcança o envio", () => {
    const deps = alcancaveis(resolve(RAIZ, "lib/agent/ingest.ts"));
    expect([...deps]).not.toContain(MODULO_DE_ENVIO);
    expect([...deps]).not.toContain(BOAS_VINDAS);
    expect([...deps]).not.toContain("@/lib/freelandoo/fila");
  });

  test("a rota de eventos do agente também não", () => {
    const deps = alcancaveis(resolve(RAIZ, "app/api/agent/events/route.ts"));
    expect([...deps]).not.toContain(MODULO_DE_ENVIO);
    expect([...deps]).not.toContain(BOAS_VINDAS);
  });

  test("nem o ack de comandos (foto do cadastro de face)", () => {
    const deps = alcancaveis(resolve(RAIZ, "app/api/agent/commands/ack/route.ts"));
    expect([...deps]).not.toContain(MODULO_DE_ENVIO);
  });

  test("nem a ingestão do WhatsApp chega à fila da Freelandoo", () => {
    const deps = alcancaveis(resolve(RAIZ, "lib/whatsapp/ingest.ts"));
    expect([...deps]).not.toContain("@/lib/freelandoo/fila");
    expect([...deps]).not.toContain(BOAS_VINDAS);
    expect([...deps]).not.toContain(LEMBRETE_AULA);
    expect([...deps]).not.toContain("@/lib/agendador");
  });
});

describe("boas-vindas e lembrete de aula são as únicas portas", () => {
  test("boas-vindas alcança o envio (controle negativo)", () => {
    // Se isto não acusasse, os outros casos estariam passando por engano.
    const deps = alcancaveis(resolve(RAIZ, "lib/freelandoo/boas-vindas.ts"));
    expect([...deps]).toContain(MODULO_DE_ENVIO);
    expect([...alcancaveis(resolve(RAIZ, "lib/aula-experimental-lembrete.ts"))]).toContain(MODULO_DE_ENVIO);
  });

  test("o lembrete de aula só é chamado pelo agendador", () => {
    const quem = modulosDe(resolve(RAIZ))
      .filter((arquivo) => importsDe(arquivo).includes(LEMBRETE_AULA))
      .map(rel);
    expect(quem).toEqual(["lib/agendador.ts"]);
  });

  /**
   * Módulos de lib/ que já alcançavam o envio antes desta decisão — todos do
   * Atendimento, chamados só por rota com sessão (clique de quem atende).
   * Congelado em 2026-10-20: entrar outro aqui é decisão de produto.
   */
  const JA_PERMITIDOS = ["lib/whatsapp/responder.ts", "lib/whatsapp/status.ts"];

  test("fora do Atendimento, todo caminho de lib/ até o envio passa por uma das portas", () => {
    const fora: string[] = [];
    for (const arquivo of modulosDe(resolve(RAIZ, "lib"))) {
      const nome = rel(arquivo);
      if (["lib/whatsapp/evolution.ts", "lib/freelandoo/boas-vindas.ts", "lib/aula-experimental-lembrete.ts"].includes(nome)) continue;
      if (JA_PERMITIDOS.includes(nome)) continue;
      if (alcancaveis(arquivo, PORTAS).has(MODULO_DE_ENVIO)) fora.push(nome);
    }
    expect(fora).toEqual([]);
  });

  test("a lista congelada ainda é verdadeira (não sobra exceção morta)", () => {
    for (const nome of JA_PERMITIDOS) {
      expect(alcancaveis(resolve(RAIZ, nome)).has(MODULO_DE_ENVIO)).toBe(true);
    }
  });
});
