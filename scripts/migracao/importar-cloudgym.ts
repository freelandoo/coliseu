/**
 * Importação completa do CloudGym (export de 2026-10-05) para o Coliseu.
 *
 * Uso:
 *   npx tsx scripts/migracao/importar-cloudgym.ts            → dry-run: só lê e gera o relatório
 *   npx tsx scripts/migracao/importar-cloudgym.ts --apply    → grava
 *   ... --dir <pasta>                                        → outro export (padrão usuarios/cloudgym-2026-10)
 *
 * Idempotente: tudo é regravado pela chave legada (id do CloudGym ou chave
 * determinística), então rodar de novo com um export mais novo só atualiza.
 * Relatório em usuarios/migracao/importacao-relatorio.md (fora do git).
 * Plano: docs/superpowers/plans/2026-10-05-importacao-cloudgym-analytics.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { parseCsv } from "../../src/lib/migracao/cloudgym";
import {
  casarComExistentes,
  chaveReceita,
  chavesCheckin,
  IndiceContato,
  instanteSaoPaulo,
  montarClientes,
  montarParcela,
  parcelaDeReferencia,
  statusDoPayment,
  type Issue,
  type Linha,
  type ParcelaCG,
} from "../../src/lib/migracao/importacao";
import {
  centavos,
  chavePlano,
  formaPagamento,
  limparData,
  limparEmail,
  limparTelefone,
  mensalidadeDoPlano,
  nomeTitleCase,
  planoAposentado,
} from "../../src/lib/migracao/limpeza";

const RAIZ = resolve(__dirname, "../..");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DIR = args.includes("--dir") ? resolve(args[args.indexOf("--dir") + 1]) : resolve(RAIZ, "usuarios/cloudgym-2026-10");
const SAIDA = resolve(RAIZ, "usuarios/migracao/importacao-relatorio.md");
const HOJE = new Date().toISOString().slice(0, 10);
const LOTE = 2000;

const issues: Issue[] = [];
const contagens: Record<string, number | string> = {};
const relatorio: string[] = [];
const log = (s: string) => {
  relatorio.push(s);
  console.log(s);
};

function ler(nome: string): Linha[] {
  const arq = resolve(DIR, `coliseu_${nome}.csv`);
  if (!existsSync(arq)) throw new Error(`arquivo faltando: ${arq}`);
  const [cab, ...linhas] = parseCsv(readFileSync(arq, "utf8"));
  return linhas.map((l) => Object.fromEntries(cab.map((c, i) => [c.trim(), l[i] ?? ""])));
}

const dia = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const dec = (cent: number | null) => (cent === null ? null : new Prisma.Decimal((cent / 100).toFixed(2)));
const n = (v: string | undefined) => (v?.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const vazio = (v: string | undefined) => (v?.trim() ? v.trim() : null);
/** "2022-06-10" ou "2019-09-16 21:27:01.037" → instante em America/Sao_Paulo (sem hora = meia-noite). */
const instante = (v: string | undefined) => {
  const [d, h] = (v ?? "").trim().split(/[ T]/);
  return d ? instanteSaoPaulo(d, h ?? "00:00:00") : null;
};

/** Regrava um lote por chave: apaga o que existe e insere de novo (atualiza na reimportação). */
async function regravar<T extends { chave: string }>(
  rotulo: string,
  linhas: T[],
  apagar: (chaves: string[]) => Promise<unknown>,
  inserir: (lote: T[]) => Promise<unknown>,
) {
  contagens[rotulo] = linhas.length;
  if (!APPLY) return;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    await prisma.$transaction([apagar(lote.map((l) => l.chave)) as never, inserir(lote) as never]);
    process.stdout.write(`\r  ${rotulo}: ${Math.min(i + LOTE, linhas.length)}/${linhas.length}`);
  }
  if (linhas.length) process.stdout.write("\n");
}

function duracaoDias(meses: number, tipo: string): number {
  if (tipo === "day") return 1;
  return ({ 12: 365, 6: 180, 3: 90, 1: 30 } as Record<number, number>)[meses] ?? Math.max(1, meses) * 30;
}

async function main() {
  console.log(`${APPLY ? "APPLY — gravando" : "DRY-RUN — nada será gravado"} · origem ${DIR}`);
  const unit = await prisma.unit.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!unit) throw new Error("nenhuma unidade no banco");
  // Dry-run antes da migration (produção): as colunas legadas ainda não existem.
  const [{ migrado }] = await prisma.$queryRaw<{ migrado: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Person' AND column_name = 'legacyCloudgymId') AS migrado`;
  if (APPLY && !migrado) throw new Error("rode a migration 20261005120000_migracao_cloudgym_analytics antes do --apply");
  if (!migrado) log("_Banco sem a migration nova: simulação lendo só as colunas atuais (ids legados contam como vazios)._\n");
  const unitId = unit.id;
  const run = APPLY ? await prisma.importRun.create({ data: { modo: "apply", origem: DIR } }) : null;

  /* ---------------- unidade, plano de contas, bancos, equipe ---------------- */
  const [u] = ler("unidade");
  if (APPLY && u) {
    await prisma.unit.update({
      where: { id: unitId },
      data: {
        legacyCloudgymId: n(u.id), razaoSocial: vazio(u.razao_social), cnpj: vazio(u.cnpj), endereco: vazio(u.endereco),
        bairro: vazio(u.bairro), cidade: vazio(u.cidade), uf: vazio(u.uf), cep: vazio(u.cep), telefone: vazio(u.telefone),
        timezone: vazio(u.timezone),
      },
    });
  }

  const contas = ler("plano_de_contas_completo");
  const contaId = new Map<number, string>(); // legacy → id
  contagens.contas_contabeis = contas.length;
  for (const c of contas) contaId.set(Number(c.id), `cgc_${c.id}`);
  if (APPLY) {
    for (const c of contas) {
      const dados = { nome: c.nome, debito: c.debito === "true", ativo: c.ativo === "true", tipo: vazio(c.tipo), unitId };
      await prisma.contaContabil.upsert({ where: { legacyCloudgymId: Number(c.id) }, create: { id: `cgc_${c.id}`, legacyCloudgymId: Number(c.id), ...dados }, update: dados });
    }
    for (const c of contas) {
      const real = await prisma.contaContabil.findUnique({ where: { legacyCloudgymId: Number(c.id) }, select: { id: true } });
      contaId.set(Number(c.id), real!.id);
    }
    for (const c of contas) {
      const pai = c.pai_id ? contaId.get(Number(c.pai_id)) : undefined;
      await prisma.contaContabil.update({ where: { legacyCloudgymId: Number(c.id) }, data: { paiId: pai ?? null } });
    }
  }

  const bancos = ler("bancos");
  contagens.contas_bancarias = bancos.length;
  if (APPLY) {
    for (const b of bancos) {
      const dados = { codigo: b.code, nome: b.name, agencia: b.agency, conta: b.account, saldo: dec(centavos(b.balance) ?? 0)!, unitId };
      await prisma.contaBancaria.upsert({ where: { legacyCloudgymId: Number(b.id) }, create: { legacyCloudgymId: Number(b.id), ...dados }, update: dados });
    }
  }

  const equipe = ler("equipe_usuarios");
  const colaboradorId = new Map<number, string>();
  contagens.colaboradores = equipe.length;
  for (const e of equipe) {
    const dados = {
      nome: nomeTitleCase(e.nome), sobrenome: e.sobrenome ? nomeTitleCase(e.sobrenome) : null, email: limparEmail(e.email),
      cargo: vazio(e.cargo), cadastradoEm: dia(limparData(e.data_cadastro)), unitId,
    };
    if (APPLY) {
      const r = await prisma.colaborador.upsert({ where: { legacyCloudgymId: Number(e.user_id) }, create: { legacyCloudgymId: Number(e.user_id), ...dados }, update: dados });
      colaboradorId.set(Number(e.user_id), r.id);
    }
  }

  /* ------------------------------------------------------------------ planos */
  const planosCG = ler("planos");
  const planosExistentes = (await prisma.plan.findMany({
    select: {
      id: true, nome: true, valorMensal: true, mescladoEmId: true, _count: { select: { mesclados: true } },
      ...(migrado ? { legacyCloudgymId: true } : {}),
    },
  })) as {
    id: string; nome: string; valorMensal: number; legacyCloudgymId?: number | null;
    mescladoEmId: string | null; _count: { mesclados: number };
  }[];
  const planoPorChave = new Map<string, string>(); // chavePlano → id
  const planoPorLegacy = new Map<number, string>();
  for (const p of planosExistentes) {
    if (p.legacyCloudgymId) planoPorLegacy.set(p.legacyCloudgymId, p.id);
    planoPorChave.set(chavePlano(p.nome), p.id);
  }
  const diffsPreco: string[] = [];
  let planosNovos = 0;
  let planosAdotados = 0;
  for (const p of planosCG) {
    const legacy = Number(p.id);
    const existente = planoPorLegacy.get(legacy) ?? planoPorChave.get(chavePlano(p.name));
    // `months` é o intervalo de cobrança; a vigência do contrato é `duration`.
    const meses = n(p.duration) ?? 1;
    const preco = mensalidadeDoPlano(centavos(p.price) ?? 0, n(p.months) ?? 1, meses);
    const dados = {
      nome: p.name.trim(), valorMensal: preco / 100, duracaoDias: duracaoDias(meses, p.type), ativo: !planoAposentado(p.name, p.status),
      meses, taxaAdesao: dec(centavos(p.registrationFee) ?? 0), parcelasAdesao: n(p.installreg),
      contaContabilId: contaId.get(Number(p.chartAccountId)) ?? null, legacyCloudgymId: legacy,
    };
    if (existente) {
      planosAdotados++;
      const atual = planosExistentes.find((x) => x.id === existente);
      // Mesclagem feita no Coliseu (tela Planos) prevalece sobre o CloudGym:
      // plano mesclado não volta, e quem estava nele vai para o destino; o
      // destino mantém nome/valor/duração definidos na mesclagem.
      if (atual?.mescladoEmId) {
        planoPorLegacy.set(legacy, atual.mescladoEmId);
        continue;
      }
      if (atual && atual._count.mesclados > 0) {
        const { nome: _n, valorMensal: _v, duracaoDias: _d, ativo: _a, ...resto } = dados;
        void _n; void _v; void _d; void _a;
        if (APPLY) await prisma.plan.update({ where: { id: existente }, data: resto });
        planoPorLegacy.set(legacy, existente);
        continue;
      }
      if (atual && atual.valorMensal > 0 && Math.round(atual.valorMensal * 100) !== preco) {
        diffsPreco.push(`  ${p.name}: Coliseu R$ ${atual.valorMensal.toFixed(2)} → CloudGym R$ ${(preco / 100).toFixed(2)}`);
      }
      if (APPLY) await prisma.plan.update({ where: { id: existente }, data: dados });
      planoPorLegacy.set(legacy, existente);
    } else {
      planosNovos++;
      if (APPLY) {
        const r = await prisma.plan.create({ data: { ...dados, unitId } });
        planoPorLegacy.set(legacy, r.id);
        planoPorChave.set(chavePlano(p.name), r.id);
      } else planoPorChave.set(chavePlano(p.name), `novo:${legacy}`);
    }
  }
  // Chave de nome dos planos do CloudGym (para casar a coluna `plan` dos clientes).
  for (const p of planosCG) {
    const id = planoPorLegacy.get(Number(p.id)) ?? planoPorChave.get(chavePlano(p.name));
    if (id) planoPorChave.set(chavePlano(p.name), id);
  }
  contagens.planos_catalogo = planosCG.length;
  contagens.planos_adotados = planosAdotados;
  contagens.planos_novos = planosNovos;

  const aulas = ler("aulas_grade");
  contagens.aulas_grade = aulas.length;
  if (APPLY) {
    for (const a of aulas) {
      const dados = {
        nome: a.name.trim(), diaSemana: Number(a.dayOfWeek), inicio: a.time.slice(0, 5), fim: a.endTime.slice(0, 5),
        capacidade: n(a.capacity) ?? 0, professorId: colaboradorId.get(Number(a.instructorId)) ?? null, unitId,
      };
      await prisma.aulaGrade.upsert({ where: { legacyCloudgymId: Number(a.id) }, create: { legacyCloudgymId: Number(a.id), ...dados }, update: dados });
    }
  }

  /* ---------------------------------------------------------------- clientes */
  const clientes = montarClientes(ler("clientes_ativos"), ler("clientes_inativos_completo"), HOJE, issues);
  const ativos = clientes.filter((c) => c.ativo);
  const pessoas = await prisma.person.findMany({
    select: {
      id: true, ...(migrado ? { legacyCloudgymId: true } : {}), cpf: true, nome: true, telefone: true, email: true, fase: true, rg: true,
      dataNascimento: true, cep: true, cidade: true, estado: true, vendedor: true,
      memberships: { orderBy: { matriculadoEm: "desc" }, take: 1, select: { id: true, status: true } },
    },
  }).then((ps) => ps.map((p) => ({ ...p, legacyCloudgymId: (p as { legacyCloudgymId?: number | null }).legacyCloudgymId ?? null })));
  const casados = casarComExistentes(clientes, pessoas);
  const porVia: Record<string, number> = {};
  for (const v of casados.values()) porVia[v.via] = (porVia[v.via] ?? 0) + 1;
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));

  const ativosNovos = ativos.filter((c) => !casados.has(c.legacyId));
  const alunosColiseu = pessoas.filter((p) => p.fase === "aluno");
  const casadoComAtivo = new Set(ativos.map((c) => casados.get(c.legacyId)?.personId).filter(Boolean) as string[]);
  const casadoComInativo = new Map(
    clientes.filter((c) => !c.ativo && casados.has(c.legacyId)).map((c) => [casados.get(c.legacyId)!.personId, c]),
  );
  const viraramInativos = alunosColiseu.filter((p) => !casadoComAtivo.has(p.id) && casadoComInativo.has(p.id));
  const alunosSemPar = alunosColiseu.filter((p) => !casadoComAtivo.has(p.id) && !casadoComInativo.has(p.id));

  const codigos = await prisma.person.findMany({ select: { codigo: true } });
  let proximoCodigo = codigos.reduce((m, p) => Math.max(m, Number(p.codigo.replace(/\D/g, "")) || 0), 0);

  const personIdPorLegacy = new Map<number, string>();
  const novasPessoas: Prisma.PersonCreateManyInput[] = [];
  for (const c of clientes) {
    const casado = casados.get(c.legacyId);
    if (casado) {
      personIdPorLegacy.set(c.legacyId, casado.personId);
      continue;
    }
    const id = `cgp_${c.legacyId}`;
    personIdPorLegacy.set(c.legacyId, id);
    novasPessoas.push({
      id, codigo: `CD${String(++proximoCodigo).padStart(5, "0")}`, nome: c.nome, legacyName: c.legacyName, legacyCloudgymId: c.legacyId,
      telefone: c.celular, telefoneFixo: c.fixo, email: c.email, cpf: c.cpf, rg: c.rg, vendedor: c.vendedor, genero: c.genero,
      origem: c.origem, origemLegado: c.origemLegado, fase: c.ativo ? "aluno" : "exaluno", dataNascimento: c.nascimento,
      cep: c.cep, estado: c.uf, cidade: c.cidade, cadastroLegado: dia(c.cadastro), inativadoEm: c.ativo ? null : dia(c.fim), unitId,
      criadoEm: dia(c.cadastro) ?? new Date(),
    });
  }
  contagens.clientes_total = clientes.length;
  contagens.clientes_casados = casados.size;
  contagens.clientes_novos = novasPessoas.length;
  contagens.ativos_novos = ativosNovos.length;
  contagens.alunos_viraram_inativos = viraramInativos.length;

  if (APPLY) {
    // Já existentes: só ganham id legado e campos que estavam vazios (o Coliseu pode ter editado o resto).
    let i = 0;
    for (const c of clientes) {
      const casado = casados.get(c.legacyId);
      if (!casado) continue;
      const p = pessoaPorId.get(casado.personId)!;
      await prisma.person.update({
        where: { id: p.id },
        data: {
          legacyCloudgymId: c.legacyId, legacyName: c.legacyName, genero: c.genero, telefoneFixo: c.fixo, origemLegado: c.origemLegado,
          cadastroLegado: dia(c.cadastro), inativadoEm: c.ativo ? null : dia(c.fim),
          ...(p.cpf ? {} : { cpf: c.cpf }), ...(p.email ? {} : { email: c.email }), ...(p.telefone ? {} : { telefone: c.celular }),
          ...(p.rg ? {} : { rg: c.rg }), ...(p.dataNascimento ? {} : { dataNascimento: c.nascimento }), ...(p.cep ? {} : { cep: c.cep }),
          ...(p.cidade ? {} : { cidade: c.cidade }), ...(p.estado ? {} : { estado: c.uf }), ...(p.vendedor ? {} : { vendedor: c.vendedor }),
          // Ativo no CloudGym que era lead no Coliseu vira aluno.
          ...(c.ativo && p.fase !== "aluno" ? { fase: "aluno" as const, estagio: null } : {}),
        },
      });
      if (++i % 200 === 0) process.stdout.write(`\r  pessoas existentes: ${i}/${casados.size}`);
    }
    process.stdout.write("\n");
    for (let j = 0; j < novasPessoas.length; j += LOTE) {
      await prisma.person.createMany({ data: novasPessoas.slice(j, j + LOTE), skipDuplicates: true });
      process.stdout.write(`\r  pessoas novas: ${Math.min(j + LOTE, novasPessoas.length)}/${novasPessoas.length}`);
    }
    process.stdout.write("\n");
  }

  /* ------------------- presença: calculada antes das matrículas (que nascem com ela) */
  const indice = new IndiceContato(clientes.map((c) => ({ id: personIdPorLegacy.get(c.legacyId)!, email: c.email, celular: c.celular, nome: c.legacyName })));
  const checkinsCSV = ler("frequencia_checkins");
  const chaves = chavesCheckin(checkinsCSV);
  const porAno: Record<string, number> = {};
  const viaCheckin: Record<string, number> = { email: 0, celular: 0, nome: 0, sem_par: 0 };
  const ultimaPresenca = new Map<string, Date>();
  const linhasCheckin: Prisma.CheckInCreateManyInput[] = [];
  checkinsCSV.forEach((l, i) => {
    porAno[l.data.slice(0, 4)] = (porAno[l.data.slice(0, 4)] ?? 0) + 1;
    const quando = instanteSaoPaulo(l.data, l.hora);
    if (!quando) {
      issues.push({ arquivo: "frequencia_checkins", linha: i + 2, motivo: "checkin_sem_data" });
      return;
    }
    const dono = indice.achar(l.email, l.celular, l.nome);
    viaCheckin[dono?.via ?? "sem_par"]++;
    if (dono && (!ultimaPresenca.has(dono.id) || ultimaPresenca.get(dono.id)! < quando)) ultimaPresenca.set(dono.id, quando);
    linhasCheckin.push({
      chave: chaves[i], unitId, personId: dono?.id ?? null, ocorridoEm: quando, origem: "cloudgym", vinculo: dono?.via ?? null,
      nomeBruto: dono ? null : vazio(l.nome), emailBruto: dono ? null : limparEmail(l.email), celularBruto: dono ? null : limparTelefone(l.celular),
    });
  });
  /* -------------------------------------------- histórico de planos e matrícula */
  const historico: { personId: string; ordem: number; nomePlano: string; planId: string | null }[] = [];
  let planoNaoCasado = 0;
  for (const c of clientes) {
    const personId = personIdPorLegacy.get(c.legacyId)!;
    c.planos.forEach((nome, ordem) => {
      const planId = planoPorChave.get(chavePlano(nome)) ?? null;
      if (!planId) planoNaoCasado++;
      historico.push({ personId, ordem, nomePlano: nome, planId: planId?.startsWith("novo:") ? null : planId });
    });
  }
  contagens.historico_planos = historico.length;
  contagens.historico_planos_sem_catalogo = planoNaoCasado;
  if (APPLY) {
    const ids = [...new Set(historico.map((h) => h.personId))];
    for (let j = 0; j < ids.length; j += LOTE) await prisma.historicoPlano.deleteMany({ where: { personId: { in: ids.slice(j, j + LOTE) } } });
    for (let j = 0; j < historico.length; j += LOTE) await prisma.historicoPlano.createMany({ data: historico.slice(j, j + LOTE) });
  }

  // Matrícula vigente: ativos espelham o CloudGym; alunos do Coliseu que viraram inativos expiram.
  let matriculasAtualizadas = 0;
  let matriculasCriadas = 0;
  const ativosSemPlano: string[] = [];
  for (const c of ativos) {
    const personId = personIdPorLegacy.get(c.legacyId)!;
    const planId = c.planos[0] ? planoPorChave.get(chavePlano(c.planos[0])) : undefined;
    const existente = pessoaPorId.get(personId)?.memberships[0];
    if (!planId && !existente) {
      ativosSemPlano.push(`${c.legacyId} ${c.planos[0] ?? "(sem plano)"}`);
      continue;
    }
    const dados = {
      status: "ACTIVE" as const,
      vencimentoPlano: dia(c.fim) ?? new Date(),
      ...(planId && !planId.startsWith("novo:") ? { planId } : {}),
    };
    if (existente) {
      matriculasAtualizadas++;
      if (APPLY) await prisma.membership.update({ where: { id: existente.id }, data: dados });
    } else {
      matriculasCriadas++;
      if (APPLY) {
        await prisma.membership.create({
          data: {
            personId, planId: planId!, status: "ACTIVE", matriculadoEm: dia(c.inicio) ?? new Date(), vencimentoPlano: dia(c.fim) ?? new Date(),
            // Sem isto a matrícula nasce com presença = agora e a regra "só avança" nunca corrige.
            ultimaPresenca: ultimaPresenca.get(personId) ?? dia(c.inicio) ?? new Date(),
          },
        });
      }
    }
  }
  if (APPLY) {
    for (const p of viraramInativos) {
      const m = p.memberships[0];
      if (m) await prisma.membership.update({ where: { id: m.id }, data: { status: "EXPIRED", vencimentoPlano: dia(casadoComInativo.get(p.id)!.fim) ?? undefined } });
    }
  }
  contagens.matriculas_atualizadas = matriculasAtualizadas;
  contagens.matriculas_criadas = matriculasCriadas;
  contagens.matriculas_expiradas = viraramInativos.length;
  for (const a of ativosSemPlano) issues.push({ arquivo: "clientes_ativos", chave: a.split(" ")[0], motivo: "ativo_sem_plano_no_catalogo", detalhe: a });

  /* -------------------------------------------------------------- financeiro */
  const previsto = ler("recebimentos_previsto_competencia");
  const caixaIds = new Set(ler("recebimentos_realizado_caixa").map((l) => l.payment_id));
  const contaDaReceita = new Map<string, number>();
  for (const r of ler("receitas_por_plano_conta")) contaDaReceita.set(chaveReceita(r.member_id, limparData(r.data), centavos(r.valor)), Number(r.plano_conta_id));
  const parcelas: ParcelaCG[] = [];
  previsto.forEach((l, i) => {
    const p = montarParcela(l, i + 2, caixaIds, issues);
    if (p) parcelas.push(p);
  });
  const semDono = parcelas.filter((p) => !personIdPorLegacy.has(p.legacyMemberId)).length;
  contagens.parcelas = parcelas.length;
  contagens.parcelas_sem_cliente = semDono;
  contagens.parcelas_realizado_caixa = parcelas.filter((p) => p.realizadoCaixa).length;
  const linhasParcela = parcelas.map((p) => {
    const conta = contaDaReceita.get(chaveReceita(p.legacyMemberId, p.pagamento, p.valorBrutoCent));
    return {
      chave: String(p.legacyPaymentId),
      dados: {
        legacyPaymentId: p.legacyPaymentId, legacyMemberId: p.legacyMemberId, personId: personIdPorLegacy.get(p.legacyMemberId) ?? null, unitId,
        vencimento: dia(p.vencimento)!, pagamento: dia(p.pagamento), compensacao: dia(p.compensacao), valorBruto: dec(p.valorBrutoCent)!,
        valorLiquido: dec(p.valorLiquidoCent), forma: p.forma, cartaoFinal: p.cartaoFinal, bandeira: p.bandeira, nsu: p.nsu, gateway: p.gateway,
        status: p.status, tipo: p.tipo, contaContabilId: conta ? (contaId.get(conta) ?? null) : null, realizadoCaixa: p.realizadoCaixa,
      },
    };
  });
  contagens.parcelas_com_conta_contabil = linhasParcela.filter((l) => l.dados.contaContabilId).length;
  await regravar(
    "parcelas_gravadas",
    linhasParcela,
    (ch) => prisma.parcela.deleteMany({ where: { legacyPaymentId: { in: ch.map(Number) } } }),
    (lote) => prisma.parcela.createMany({ data: lote.map((l) => l.dados) }),
  );

  // Situação financeira que a catraca enxerga (bloqueador B1): só para quem não tem Payment.
  const parcelasPorCliente = new Map<number, ParcelaCG[]>();
  for (const p of parcelas) parcelasPorCliente.set(p.legacyMemberId, [...(parcelasPorCliente.get(p.legacyMemberId) ?? []), p]);
  const comPayment = new Set(
    (await prisma.billingCustomer.findMany({ where: { subscriptions: { some: { payments: { some: {} } } } }, select: { personId: true } })).map((b) => b.personId),
  );
  const statusB1: Record<string, number> = {};
  let paymentsCriados = 0;
  for (const c of ativos) {
    const personId = personIdPorLegacy.get(c.legacyId)!;
    if (comPayment.has(personId)) continue;
    const ref = parcelaDeReferencia(parcelasPorCliente.get(c.legacyId) ?? [], HOJE);
    if (!ref) {
      statusB1.SEM_PARCELA = (statusB1.SEM_PARCELA ?? 0) + 1;
      continue;
    }
    const status = statusDoPayment(ref, HOJE);
    statusB1[status] = (statusB1[status] ?? 0) + 1;
    paymentsCriados++;
    if (!APPLY) continue;
    const cus = await prisma.billingCustomer.upsert({
      where: { personId }, create: { asaasCustomerId: `cg_cus_${c.legacyId}`, personId }, update: {},
    });
    const sub = await prisma.billingSubscription.upsert({
      where: { asaasSubscriptionId: `cg_sub_${c.legacyId}` },
      create: { asaasSubscriptionId: `cg_sub_${c.legacyId}`, customerId: cus.id, value: ref.valorBrutoCent / 100, status: "ACTIVE" },
      update: { value: ref.valorBrutoCent / 100 },
    });
    const pay = {
      subscriptionId: sub.id, billingType: ref.forma, value: ref.valorBrutoCent / 100, dueDate: dia(ref.vencimento)!, status,
      paidAt: status === "PAID" ? dia(ref.pagamento ?? ref.vencimento) : null, statusUpdatedAt: new Date(),
    };
    await prisma.payment.upsert({ where: { asaasPaymentId: `cg_pay_${ref.legacyPaymentId}` }, create: { asaasPaymentId: `cg_pay_${ref.legacyPaymentId}`, ...pay }, update: pay });
  }
  contagens.payments_espelhados = paymentsCriados;

  const taxas = ler("taxas_pagamento");
  const vistosTaxa = new Map<string, number>();
  const linhasTaxa = taxas.map((t) => {
    const base = chaveReceita(t.member_id, limparData(t.data), centavos(t.valor));
    const k = vistosTaxa.get(base) ?? 0;
    vistosTaxa.set(base, k + 1);
    return {
      chave: `${base}|${k}`, legacyMemberId: Number(t.member_id), personId: personIdPorLegacy.get(Number(t.member_id)) ?? null, unitId,
      data: dia(limparData(t.data))!, valor: dec(centavos(t.valor) ?? 0)!, contaContabilId: contaId.get(Number(t.plano_conta_id)) ?? null,
    };
  });
  await regravar("taxas", linhasTaxa, (ch) => prisma.taxaPagamento.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.taxaPagamento.createMany({ data: lote }));

  const vendasPlanos = ler("vendas_planos");
  const vistosVenda = new Map<string, number>();
  const linhasVenda = vendasPlanos.map((v) => {
    const base = `${v.data}|${v.plano}|${v.vendedor_id}`;
    const k = vistosVenda.get(base) ?? 0;
    vistosVenda.set(base, k + 1);
    const planId = planoPorChave.get(chavePlano(v.plano));
    return {
      chave: `${base}|${k}`, unitId, data: dia(limparData(v.data))!, nomePlano: v.plano.trim(),
      planId: planId && !planId.startsWith("novo:") ? planId : null, qtdContratos: n(v.qtd_contratos) ?? 0,
      total: dec(centavos(v.total) ?? 0)!, vendedorId: n(v.vendedor_id), vendedorNome: vazio(v.vendedor),
    };
  });
  await regravar("vendas_planos", linhasVenda, (ch) => prisma.vendaPlanoDia.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.vendaPlanoDia.createMany({ data: lote }));

  // Livro caixa: Vendido e Recebido viram uma linha com as duas flags.
  const livro = new Map<string, Prisma.LancamentoCaixaCreateManyInput>();
  const somarLivro = (linhas: Linha[], categoria: string, visao: "vendido" | "recebido") => {
    const vistos = new Map<string, number>();
    for (const l of linhas) {
      const descricao = (categoria === "servico" ? l.plano : l.descricao)?.trim() ?? "";
      const base = `${categoria}|${l.member_id ?? ""}|${l.data}|${l.valor}|${l.forma_pagamento}|${descricao}`;
      const k = vistos.get(base) ?? 0;
      vistos.set(base, k + 1);
      const chave = `${base}|${k}`;
      const atual = livro.get(chave);
      if (atual) {
        atual[visao] = true;
        continue;
      }
      const vendedor = [l.vendedor_nome ?? l.usuario_nome, l.vendedor_sobrenome ?? l.usuario_sobrenome].filter((s) => s?.trim()).join(" ");
      livro.set(chave, {
        chave, unitId, categoria, data: dia(limparData(l.data))!, valor: dec(centavos(l.valor) ?? 0)!,
        forma: formaPagamento(l.forma_pagamento) ?? vazio(l.forma_pagamento), legacyMemberId: n(l.member_id),
        personId: l.member_id ? (personIdPorLegacy.get(Number(l.member_id)) ?? null) : null, descricao,
        vendedorNome: vendedor ? nomeTitleCase(vendedor) : null, vendido: visao === "vendido", recebido: visao === "recebido",
      });
    }
  };
  somarLivro(ler("livro_caixa_vendido_servicos"), "servico", "vendido");
  somarLivro(ler("livro_caixa_recebido_servicos"), "servico", "recebido");
  somarLivro(ler("livro_caixa_vendido_operacional"), "operacional", "vendido");
  somarLivro(ler("livro_caixa_recebido_operacional"), "operacional", "recebido");
  await regravar("livro_caixa", [...livro.values()] as (Prisma.LancamentoCaixaCreateManyInput & { chave: string })[], (ch) => prisma.lancamentoCaixa.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.lancamentoCaixa.createMany({ data: lote }));

  /* ---------------------------------------------------------- presença (check-ins) */
  await regravar("checkins", linhasCheckin as (Prisma.CheckInCreateManyInput & { chave: string })[], (ch) => prisma.checkIn.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.checkIn.createMany({ data: lote }));
  contagens.checkins_sem_par = viaCheckin.sem_par;

  // Última presença só avança (mesma regra da ingestão dos giros da catraca).
  let presencasAvancadas = 0;
  const membershipsAtuais = await prisma.membership.findMany({
    where: { personId: { in: [...ultimaPresenca.keys()].filter((id) => !id.startsWith("cgp_") || APPLY) } },
    orderBy: { matriculadoEm: "desc" },
    select: { id: true, personId: true, ultimaPresenca: true },
  });
  const vistasMembership = new Set<string>();
  for (const m of membershipsAtuais) {
    if (vistasMembership.has(m.personId)) continue;
    vistasMembership.add(m.personId);
    const nova = ultimaPresenca.get(m.personId);
    if (nova && nova > m.ultimaPresenca) {
      presencasAvancadas++;
      if (APPLY) await prisma.membership.update({ where: { id: m.id }, data: { ultimaPresenca: nova } });
    }
  }
  contagens.presencas_avancadas = presencasAvancadas;

  /* ------------------------------------------------------- NPS, auditoria, leads */
  const nps = ler("nps");
  const linhasNps = nps.map((r) => ({
    chave: `${r.member_id}|${r.data}`, unitId, personId: personIdPorLegacy.get(Number(r.member_id)) ?? null,
    respondidaEm: instante(r.data)!, score: Number(r.score), feedback: vazio(r.feedback),
  }));
  await regravar("nps", linhasNps, (ch) => prisma.npsResposta.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.npsResposta.createMany({ data: lote }));

  const auditoria = ler("auditoria");
  const vistosAud = new Map<string, number>();
  const linhasAud = auditoria.map((a) => {
    const base = `${a.data}|${a.hora}|${a.operacao_cod}|${a.member_id}`;
    const k = vistosAud.get(base) ?? 0;
    vistosAud.set(base, k + 1);
    return {
      chave: `${base}|${k}`, unitId, ocorridoEm: instanteSaoPaulo(a.data, a.hora) ?? dia(limparData(a.data))!, operacaoCod: a.operacao_cod,
      descricao: vazio(a.descricao), usuario: vazio(a.usuario), legacyMemberId: n(a.member_id),
      personId: a.member_id ? (personIdPorLegacy.get(Number(a.member_id)) ?? null) : null,
    };
  });
  await regravar("auditoria", linhasAud, (ch) => prisma.auditoriaLegado.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.auditoriaLegado.createMany({ data: lote }));

  const leads = [
    ...ler("audiencia_leads_completo").map((l) => ({
      chave: `audiencia:${l.lead_id}`, unitId, nome: nomeTitleCase(l.nome), tipo: vazio(l.tipo),
      cadastradoEm: instante(l.data), celular: limparTelefone(l.celular),
      email: limparEmail(l.email), status: vazio(l.status), origem: vazio(l.origem), vendedor: null as string | null,
      personId: indice.achar(l.email, l.celular, null)?.id ?? null,
    })),
    ...ler("leads_pipeline").map((l) => ({
      chave: `pipeline:${l.lead_id}`, unitId, nome: nomeTitleCase(l.nome), tipo: "pipeline",
      cadastradoEm: dia(limparData(l.data_cadastro)), celular: limparTelefone(l.telefone), email: limparEmail(l.email), status: null,
      origem: vazio(l.origem), vendedor: vazio(l.vendedor), personId: l.member_id ? (personIdPorLegacy.get(Number(l.member_id)) ?? null) : null,
    })),
  ];
  await regravar("leads_legado", leads, (ch) => prisma.leadLegado.deleteMany({ where: { chave: { in: ch } } }), (lote) => prisma.leadLegado.createMany({ data: lote }));

  /* ----------------------------------------------------------------- relatório */
  const resumo = ler("clientes_por_unidade")[0];
  const soma = (ps: ParcelaCG[]) => ps.reduce((s, p) => s + p.valorBrutoCent, 0) / 100;
  const naoEstornadas = parcelas.filter((p) => p.status !== "canceled");
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  log(`# Importação CloudGym — ${APPLY ? "APPLY" : "DRY-RUN"} em ${new Date().toISOString()}`);
  log(`Origem: ${DIR}\n`);
  log(`## Clientes`);
  log(`- ${clientes.length} clientes (${ativos.length} ativos; resumo do CloudGym diz ${resumo?.Ativos} ativos / ${resumo?.Inativos} inativos)`);
  log(`- Casados com quem já existe no Coliseu: ${casados.size} (${Object.entries(porVia).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  log(`- Pessoas novas: ${novasPessoas.length} (ativos novos ${ativosNovos.length}; ex-alunos ${novasPessoas.length - ativosNovos.length})`);
  log(`- Alunos do Coliseu que viraram inativos no CloudGym → matrícula EXPIRED: ${viraramInativos.length}`);
  log(`- Alunos do Coliseu sem par no CloudGym (ficam como estão): ${alunosSemPar.length}`);
  log(`- Matrículas: ${matriculasAtualizadas} atualizadas, ${matriculasCriadas} criadas; ativos sem plano no catálogo: ${ativosSemPlano.length}`);
  log(`- Histórico de planos: ${historico.length} linhas (${planoNaoCasado} sem plano no catálogo)\n`);
  log(`## Planos`);
  log(`- Catálogo: ${planosCG.length} (${planosAdotados} já existiam, ${planosNovos} novos)`);
  if (diffsPreco.length) log(`- Preço diferente do que estava no Coliseu (${diffsPreco.length}):\n${diffsPreco.join("\n")}`);
  log(`\n## Financeiro`);
  log(`- Parcelas: ${parcelas.length} (${semDono} sem cliente; ${contagens.parcelas_com_conta_contabil} classificadas no plano de contas; ${contagens.parcelas_realizado_caixa} na visão Realizado Caixa)`);
  log(`- Situação para a catraca (B1): ${paymentsCriados} pagamentos espelhados — ${Object.entries(statusB1).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  log(`- Taxas ${linhasTaxa.length} · vendas de planos ${linhasVenda.length} · livro caixa ${livro.size}`);
  log(`- Conferência por mês de pagamento (bruto, sem estornos):`);
  for (const mes of ["2026-07", "2026-08", "2026-09"]) {
    const doMes = naoEstornadas.filter((p) => p.pagamento?.startsWith(mes));
    log(`  ${mes}: ${doMes.length} parcelas, ${brl(soma(doMes))}`);
  }
  log(`\n## Presença`);
  log(`- Check-ins: ${checkinsCSV.length} — por ano: ${Object.entries(porAno).sort().map(([a, v]) => `${a} ${v}`).join(", ")}`);
  log(`- Vínculo: email ${viaCheckin.email}, celular ${viaCheckin.celular}, nome ${viaCheckin.nome}, sem par ${viaCheckin.sem_par} (${(100 - (viaCheckin.sem_par / checkinsCSV.length) * 100).toFixed(1)}% vinculados)`);
  log(`- Última presença avançada em ${presencasAvancadas} matrículas${APPLY ? "" : " (contando só quem já existe; pessoas novas entram no apply)"}`);
  log(`\n## Outros`);
  log(`- Contas contábeis ${contas.length} · bancos ${bancos.length} · equipe ${equipe.length} · grade de aulas ${aulas.length} · NPS ${nps.length} · auditoria ${auditoria.length} · leads históricos ${leads.length}`);
  const porMotivo: Record<string, number> = {};
  for (const i of issues) porMotivo[i.motivo] = (porMotivo[i.motivo] ?? 0) + 1;
  log(`\n## Issues (${issues.length})`);
  for (const [m, q] of Object.entries(porMotivo).sort((a, b) => b[1] - a[1])) log(`- ${m}: ${q}`);
  log(`\n## Pendências para a recepção`);
  log(`- Lista dos que viraram inativos: usuarios/migracao/viraram-inativos.csv`);

  mkdirSync(resolve(RAIZ, "usuarios/migracao"), { recursive: true });
  writeFileSync(SAIDA, relatorio.join("\n") + "\n");
  writeFileSync(
    resolve(RAIZ, "usuarios/migracao/viraram-inativos.csv"),
    "﻿nome,telefone,cpf,fim_no_cloudgym\n" +
      viraramInativos.map((p) => [p.nome, p.telefone ?? "", p.cpf ?? "", casadoComInativo.get(p.id)?.fim ?? ""].map((v) => `"${v}"`).join(",")).join("\n"),
  );

  if (run) {
    for (let j = 0; j < issues.length; j += LOTE) {
      await prisma.importIssue.createMany({
        data: issues.slice(j, j + LOTE).map((i) => ({ runId: run.id, arquivo: i.arquivo, linha: i.linha ?? null, chave: i.chave ?? null, motivo: i.motivo, detalhe: i.detalhe ?? null })),
      });
    }
    await prisma.importRun.update({ where: { id: run.id }, data: { terminadoEm: new Date(), contagens, ok: true } });
  }
  console.log(`\nrelatório: ${SAIDA}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
