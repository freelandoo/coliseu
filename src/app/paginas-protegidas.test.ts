import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { expect, test } from "vitest";

/**
 * Toda tela do sistema checa o papel de quem abre — na própria página ou num
 * layout acima dela. Esconder o link no menu não protege nada: em out/2026 o
 * técnico (só catraca) abria a lista de alunos e a captação digitando o
 * endereço. Este teste impede que uma tela nova nasça sem guard.
 *
 * O `(app)/layout.tsx` só exige estar logado, então não conta.
 */
const RAIZ = join(__dirname, "(app)");
const GUARD = /require(Modulo|Role|Desenvolvedor)\(/;

/** Telas de todo papel logado (só `requireUser` de propósito) e redirects. */
const ABERTAS_A_TODOS = new Set(["perfil", "acesso", join("captacao", "atendimento")]);

function paginas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return paginas(p);
    return e.name === "page.tsx" ? [p] : [];
  });
}

function protegida(pagina: string): boolean {
  if (GUARD.test(readFileSync(pagina, "utf8"))) return true;
  for (let d = dirname(pagina); d.length > RAIZ.length; d = dirname(d)) {
    const layout = join(d, "layout.tsx");
    if (existsSync(layout) && GUARD.test(readFileSync(layout, "utf8"))) return true;
  }
  return false;
}

test("toda página de (app) tem guard de papel/módulo", () => {
  const semGuard = paginas(RAIZ)
    .map((p) => ({ p, rota: relative(RAIZ, dirname(p)) }))
    .filter(({ rota }) => !ABERTAS_A_TODOS.has(rota))
    .filter(({ p }) => !protegida(p))
    .map(({ rota }) => `/${rota.split(sep).join("/")}`);
  expect(semGuard).toEqual([]);
});
