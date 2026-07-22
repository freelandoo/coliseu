/**
 * Cadastra no Coliseu os planos vistos no export do CloudGym (todos, incluindo
 * FREE PASS, Parceria, BOLSISTA e promoções) — faltando só o valor mensal.
 *
 * Uso:
 *   npx tsx scripts/migracao/cadastrar-planos.ts            → dry-run
 *   npx tsx scripts/migracao/cadastrar-planos.ts --apply    → grava
 *
 * Cada plano nasce com valorMensal 0 e ativo=false: preencher o valor no admin
 * e ativar. A duração (em dias) vem da moda dos contratos reais (Início → Final) dos
 * alunos daquele plano. Idempotente: plano com o mesmo nome na unidade é pulado
 * (a adoção — Task 6 — reusa por nome, então nada duplica).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../src/lib/db";
import { parseCloudGym } from "../../src/lib/migracao/cloudgym";

const ARQ_ATIVOS = resolve(__dirname, "../../usuarios/couldgym/alunos1.csv");

function diasDeContrato(inicioISO: string | null, fimISO: string | null): number | null {
  if (!inicioISO || !fimISO) return null;
  const dias = (Date.parse(fimISO) - Date.parse(inicioISO)) / 86_400_000;
  return Math.max(1, Math.round(dias));
}

function moda(valores: number[]): number {
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { alunos, avisos } = parseCloudGym(readFileSync(ARQ_ATIVOS, "utf8"), "ATIVO");
  for (const a of avisos) console.warn(`aviso: ${a}`);

  const porPlano = new Map<string, { nome: string; duracoes: number[]; alunos: number }>();
  for (const a of alunos) {
    const nome = a.plano.trim();
    if (!nome) continue;
    const chave = nome.toUpperCase();
    const g = porPlano.get(chave) ?? { nome, duracoes: [], alunos: 0 };
    g.alunos++;
    const dias = diasDeContrato(a.inicioISO, a.fimISO);
    if (dias !== null) g.duracoes.push(dias);
    porPlano.set(chave, g);
  }

  const unidades = await prisma.unit.findMany();
  if (unidades.length !== 1) throw new Error(`esperava 1 unidade, achei ${unidades.length}`);
  const unit = unidades[0];

  const existentes = await prisma.plan.findMany({ where: { unitId: unit.id } });
  const jaTem = new Set(existentes.map((p) => p.nome.trim().toUpperCase()));

  let criados = 0, pulados = 0;
  const linhas: string[] = [];
  for (const [chave, g] of [...porPlano.entries()].sort((a, b) => b[1].alunos - a[1].alunos)) {
    const duracao = g.duracoes.length ? moda(g.duracoes) : 30;
    if (jaTem.has(chave)) {
      pulados++;
      linhas.push(`  = ${g.nome}  (já existia)`);
      continue;
    }
    criados++;
    linhas.push(`  + ${g.nome}  — ${g.alunos} alunos, ${duracao} dias`);
    if (apply) {
      await prisma.plan.create({
        data: {
          unitId: unit.id, nome: g.nome, valorMensal: 0, duracaoDias: duracao, ativo: false,
          descricao: "Importado do CloudGym — completar valor mensal e ativar",
        },
      });
    }
  }

  console.log(linhas.join("\n"));
  console.log(`\n${apply ? ">>> APLICADO <<<" : ">>> DRY-RUN — use --apply para gravar <<<"}`);
  console.log(`unidade: ${unit.nome ?? unit.id} | planos no export: ${porPlano.size} | criados: ${criados} | já existiam: ${pulados}`);
  if (apply && criados) console.log(`\nAgora é só preencher o valor mensal de cada um no admin e ativar.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
