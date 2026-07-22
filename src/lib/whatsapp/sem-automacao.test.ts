import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

/**
 * Teste de arquitetura, não de comportamento.
 *
 * A promessa do produto é que ninguém é respondido automaticamente. Garantir
 * isso com um caso de uso seria frágil (um caminho novo escaparia); garantir com
 * a topologia dos imports é definitivo: se a ingestão não alcança o módulo que
 * envia, nenhum evento recebido pode virar mensagem enviada.
 *
 * Se este teste falhar, alguém ligou os dois lados. Isso pode ser legítimo — mas
 * é uma decisão de produto, e tem que ser tomada de propósito.
 */

const RAIZ = resolve(__dirname, "../..");
const MODULO_DE_ENVIO = "@/lib/whatsapp/evolution";

/** Caminho de import interno → arquivo em disco. */
function arquivoDe(especificador: string): string | null {
  if (!especificador.startsWith("@/")) return null; // dependência externa
  return resolve(RAIZ, `${especificador.slice(2)}.ts`);
}

function importsDe(arquivo: string): string[] {
  const fonte = readFileSync(arquivo, "utf8");
  return [...fonte.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Fecho transitivo dos imports internos a partir de um arquivo. */
function alcancaveis(entrada: string): Set<string> {
  const vistos = new Set<string>();
  const fila = [entrada];
  while (fila.length) {
    const atual = fila.pop()!;
    for (const especificador of importsDe(atual)) {
      if (vistos.has(especificador)) continue;
      vistos.add(especificador);
      const arquivo = arquivoDe(especificador);
      if (arquivo) fila.push(arquivo);
    }
  }
  return vistos;
}

test("a ingestão do webhook não alcança o módulo que envia mensagens", () => {
  const dependencias = alcancaveis(resolve(RAIZ, "lib/whatsapp/ingest.ts"));
  expect([...dependencias]).not.toContain(MODULO_DE_ENVIO);
});

test("o webhook em si também não alcança o envio", () => {
  const dependencias = alcancaveis(resolve(RAIZ, "app/api/webhooks/whatsapp/route.ts"));
  expect([...dependencias]).not.toContain(MODULO_DE_ENVIO);
});

test("o teste sabe detectar o vínculo (controle negativo)", () => {
  // A rota de resposta manual importa o envio — se este caso não acusasse,
  // os dois testes acima estariam passando por engano.
  const dependencias = alcancaveis(
    resolve(RAIZ, "app/api/whatsapp/conversas/[id]/mensagens/route.ts"),
  );
  expect([...dependencias]).toContain(MODULO_DE_ENVIO);
});
