/**
 * Deixa os planos do Coliseu iguais aos do CloudGym (pedido de 26/10/2026: o
 * CloudGym é a referência de nome, preço e vigência).
 *
 * - plano do CloudGym que o Coliseu tem (legacyCloudgymId): nome, mensalidade
 *   e vigência passam a ser os de lá. Ativo/arquivado NÃO muda: o CloudGym não
 *   deixa apagar plano, e o arquivamento feito no Coliseu (limpeza de 26/10)
 *   é a curadoria do que se vende;
 * - plano do CloudGym que o Coliseu não tem: é criado — ativo se é da tabela
 *   atual (id >= PRIMEIRO_ID_ATUAL) e não é "W NÃO USAR"; os antigos entram
 *   arquivados (ficam só para o espelho);
 * - "deixe somente os mais atuais" (Alex, 26/10): fora da tabela atual, só as
 *   cortesias sem cobrança (CORTESIAS) ficam à venda — o resto é arquivado;
 * - plano do Coliseu que sumiu do CloudGym: arquivado (ativo = false). Quem
 *   está nele continua nele — arquivar só tira das matrículas novas;
 * - plano mesclado no Coliseu (tela Planos) não volta, e o destino de uma
 *   mesclagem mantém nome/valor/vigência da mesclagem (regra da importação).
 *
 * Mensalidade: ver `mensalidadeCloudgym` — os casos marcados "conferir" saem
 * no relatório. Login: CLOUDGYM_USUARIO/CLOUDGYM_SENHA.
 *
 *   npx tsx scripts/sincronizar-planos-cloudgym.ts            # prévia
 *   npx tsx scripts/sincronizar-planos-cloudgym.ts --aplicar
 */
import { PrismaClient } from "@prisma/client";
import { listarPlanos } from "../src/lib/cloudgym/api";
import { duracaoDiasCloudgym, mensalidadeCloudgym } from "../src/lib/cloudgym/planos";
import { planoAposentado } from "../src/lib/migracao/limpeza";

const aplicar = process.argv.includes("--aplicar");
/** Planos criados lá só para testar a integração — nunca oferecer. */
const PLANOS_DE_TESTE = new Set([233521]);
/** Primeiro plano da tabela de outubro/2026 no CloudGym — a tabela atual. */
const PRIMEIRO_ID_ATUAL = 232516;
/** Cortesias sem cobrança que a recepção usa: FREE PASS, Bolsista, Parceria. */
const CORTESIAS = new Set([151137, 62698, 178187]);

/**
 * Plano à venda hoje: tabela de outubro/2026 (ids novos, ou planos antigos que
 * o CloudGym renomeou com "Outubro" no lugar de recriar) e as cortesias. Fora
 * isso, arquivado — quem está nele continua nele.
 */
function ehAtual(p: { id: number; name: string; months: number; duration: number; type: string }): boolean {
  if (PLANOS_DE_TESTE.has(p.id) || planoAposentado(p.name, null)) return false;
  // Cadastro incoerente lá (mais parcelas que meses, ex.: "ANUAL" com duration 1): conferir antes de vender.
  if (p.type !== "day" && p.months > p.duration) return false;
  return p.id >= PRIMEIRO_ID_ATUAL || /outubro/i.test(p.name) || CORTESIAS.has(p.id);
}

async function main() {
  const prisma = new PrismaClient();
  const unit = await prisma.unit.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const cg = await listarPlanos();
  const locais = await prisma.plan.findMany({
    select: {
      id: true, nome: true, valorMensal: true, duracaoDias: true, ativo: true, legacyCloudgymId: true,
      mescladoEmId: true, _count: { select: { mesclados: true, memberships: true } },
    },
  });
  const porLegacy = new Map(locais.filter((l) => l.legacyCloudgymId).map((l) => [l.legacyCloudgymId!, l]));
  const idsCg = new Set(cg.map((p) => p.id));

  const criar: string[] = [];
  const mudar: string[] = [];
  const conferir: string[] = [];
  const arquivar: string[] = [];
  const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

  for (const p of cg) {
    const { valorMensal, leitura } = mensalidadeCloudgym(p);
    const dados = {
      nome: p.name.trim(),
      valorMensal,
      duracaoDias: duracaoDiasCloudgym(p),
      meses: p.duration > 0 ? p.duration : 1,
      ativo: ehAtual(p),
    };
    const incoerente = p.type !== "day" && p.months > p.duration;
    if (leitura === "conferir" || leitura === "por_parcela" || incoerente) {
      conferir.push(`  ${p.id} ${dados.nome} — price ${p.price}, months ${p.months}, duration ${p.duration} → ${brl(valorMensal)}/mês (${leitura})`);
    }
    const local = porLegacy.get(p.id);
    if (!local) {
      criar.push(`  + ${dados.nome} · ${brl(valorMensal)}/mês · ${dados.duracaoDias} dias${dados.ativo ? "" : " (arquivado)"}`);
      if (aplicar) await prisma.plan.create({ data: { ...dados, unitId: unit.id, legacyCloudgymId: p.id } });
      continue;
    }
    if (local.mescladoEmId) continue; // mesclado no Coliseu: fica onde a mesclagem pôs
    const destinoDeMescla = local._count.mesclados > 0;
    const novo = destinoDeMescla ? { meses: dados.meses } : dados;
    const diffs = [
      !destinoDeMescla && local.nome !== dados.nome && `nome "${local.nome}" → "${dados.nome}"`,
      !destinoDeMescla && Math.abs(local.valorMensal - valorMensal) > 0.005 && `${brl(local.valorMensal)} → ${brl(valorMensal)}`,
      !destinoDeMescla && local.duracaoDias !== dados.duracaoDias && `${local.duracaoDias} → ${dados.duracaoDias} dias`,
      !destinoDeMescla && local.ativo !== dados.ativo && (dados.ativo ? "volta à venda" : "arquivado"),
    ].filter(Boolean);
    if (diffs.length) mudar.push(`  ~ ${dados.nome} (${local._count.memberships} matrícula(s)): ${diffs.join("; ")}`);
    if (aplicar && diffs.length) await prisma.plan.update({ where: { id: local.id }, data: novo });
  }

  for (const l of locais) {
    if (!l.ativo || l.mescladoEmId) continue;
    // Os que estão no CloudGym já foram decididos no laço acima.
    if (l.legacyCloudgymId !== null && idsCg.has(l.legacyCloudgymId)) continue;
    const motivo = "sumiu do CloudGym";
    arquivar.push(`  - ${l.nome} — ${motivo} (${l._count.memberships} matrícula(s) continuam nele)`);
    if (aplicar) await prisma.plan.update({ where: { id: l.id }, data: { ativo: false } });
  }

  console.log(`${aplicar ? "APLICADO" : "PRÉVIA (nada gravado)"} · CloudGym ${cg.length} planos · Coliseu ${locais.length}`);
  console.log(`\nCriar (${criar.length}):\n${criar.join("\n")}`);
  console.log(`\nAtualizar (${mudar.length}):\n${mudar.join("\n")}`);
  console.log(`\nArquivar (${arquivar.length}):\n${arquivar.join("\n")}`);
  console.log(`\nPreço lido de jeito diferente — conferir (${conferir.length}):\n${conferir.join("\n")}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
