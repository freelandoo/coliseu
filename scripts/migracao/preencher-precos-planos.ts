/**
 * One-off (2026-07-20): preenche valorMensal dos planos importados do CloudGym
 * usando os preços de tabela derivados das vendas de julho
 * (usuarios/migracao/planos-precos.csv). O CSV traz o TOTAL do contrato; a coluna
 * da tela é VALOR/MÊS, então valorMensal = round(total / meses do contrato),
 * com os meses saindo da duração em dias (30 dias = 1 mês).
 *
 * Ativa os planos recorrentes preenchidos; deixa "TAXA MATRICULA" arquivada
 * (é taxa avulsa, não mensalidade). Dry-run por padrão; --apply grava.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../src/lib/db";

const CSV = resolve(__dirname, "../../usuarios/migracao/planos-precos.csv");

function parseSimples(csv: string): string[][] {
  return csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) =>
    [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((x) => x[1].replace(/""/g, '"')),
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const linhas = parseSimples(readFileSync(CSV, "utf8"));
  const cab = linhas[0];
  const iPlano = cab.indexOf("plano");
  const iPreco = cab.indexOf("preco_unitario");

  // nome(upper) -> total do contrato
  const precoDe = new Map<string, number>();
  for (const l of linhas.slice(1)) {
    const nome = (l[iPlano] || "").trim().toUpperCase();
    const preco = parseFloat(l[iPreco] || "");
    if (nome && preco > 0) precoDe.set(nome, preco);
  }

  const planos = await prisma.plan.findMany();
  const linha = (s: string, n: number) => s.slice(0, n).padEnd(n);
  console.log(linha("PLANO", 44), "DUR", "TOTAL".padStart(9), "→ VALOR/MÊS".padStart(12), " AÇÃO");
  console.log("".padEnd(90, "-"));

  let atualizados = 0;
  for (const p of planos) {
    const total = precoDe.get(p.nome.trim().toUpperCase());
    if (total == null) continue;
    const dias = p.duracaoDias && p.duracaoDias > 0 ? p.duracaoDias : 30;
    const dur = Math.max(1, Math.round(dias / 30.44));
    const valorMensal = Math.round((total / dur) * 100) / 100;
    const ehTaxa = /TAXA/i.test(p.nome);
    const ativar = !ehTaxa; // taxa avulsa fica arquivada
    const acao = `R$${valorMensal.toFixed(2)}/mês` + (ativar ? " +ATIVAR" : " (mantém arquivado)");
    console.log(linha(p.nome, 44), String(dias).padStart(3), ("R$" + total.toFixed(2)).padStart(9), "→", valorMensal.toFixed(2).padStart(9), " " + acao);

    if (apply) {
      await prisma.plan.update({
        where: { id: p.id },
        data: { valorMensal, ...(ativar ? { ativo: true } : {}) },
      });
    }
    atualizados++;
  }

  console.log("\n" + (apply ? ">>> APLICADO <<<" : ">>> DRY-RUN — use --apply para gravar <<<"));
  console.log(`${atualizados} planos com preço aplicável (dos ${planos.length} no banco).`);
  console.log(`${planos.length - atualizados} sem preço nas vendas de julho → seguem R$0/arquivados (falta a info de preço).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
