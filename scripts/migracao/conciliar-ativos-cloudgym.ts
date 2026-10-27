/**
 * Deixa ativos e inadimplentes do Coliseu iguais aos do CloudGym — decisão do
 * Alex de 27/10/2026: "só acertar uma vez agora" (o CloudGym é a referência; a
 * recepção para de lançar lá). Pode rodar de novo quando quiser: é idempotente.
 *
 * Ativos (listagem do CloudGym, status active):
 * - ativo lá que não existe aqui: cadastra (fase aluno, legacyCloudgymId) e
 *   matricula no plano do contrato vigente de lá;
 * - ativo lá sem matrícula ativa aqui (nenhuma, ou EXPIRED): matricula no plano
 *   do contrato vigente de lá;
 * - ativo lá e aqui: o vencimento do plano só AVANÇA para o fim do contrato de
 *   lá (renovação feita no CloudGym), e só para quem não paga pelo Asaas;
 * - ativo aqui e inativo lá: a matrícula vira EXPIRED. Fica de fora quem não
 *   existe no CloudGym (aparece no relatório) e quem matriculou no Coliseu
 *   depois que o espelho ligou (o espelho é que leva para lá).
 *
 * Inadimplentes (relatório "pagamentos pendentes" + parcelas abertas daqui):
 * - a parcela importada em 05/10 (cg_pay_<id>) ganha o status de hoje lá
 *   (paga, cancelada, vencida);
 * - a parcela vencida mais antiga de lá vira Payment aqui, como a importação
 *   fazia (cliente cg_cus_, assinatura cg_sub_).
 *
 * Catraca: quem tem matrícula expirada e já está no aparelho recebe o DISABLE
 * (`recalcularAcessoDePessoa`). Quem não está no aparelho não é provisionado.
 *
 *   DATABASE_URL=... CLOUDGYM_USUARIO=... CLOUDGYM_SENHA=... \
 *     npx tsx scripts/migracao/conciliar-ativos-cloudgym.ts [--aplicar]
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  listarClientes,
  obterCliente,
  pendenciasDePagamento,
  type CgCliente,
  type CgClienteLista,
  type CgContrato,
} from "../../src/lib/cloudgym/api";
import { origemDoColiseu } from "../../src/lib/migracao/importacao";
import { recalcularAcessoDePessoa } from "../../src/lib/access/outbox";
import { ehIdAsaasReal } from "../../src/lib/asaas";

const APLICAR = process.argv.includes("--aplicar");
const RELATORIO = process.argv.find((a) => a.startsWith("--relatorio="))?.slice(12) ?? "conciliacao-cloudgym.txt";
/** O espelho Coliseu → CloudGym ligou aqui: matrícula feita depois disso é do Coliseu. */
const ESPELHO_DESDE = new Date(process.env.CLOUDGYM_ESPELHO_DESDE ?? "2026-10-26T22:25:00Z");
const CONTRATO_ENCERRADO = new Set(["canceled", "finished"]);

const prisma = new PrismaClient();
const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const dia = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null);
const hojeISO = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const linhas: string[] = [];
const log = (s: string) => {
  linhas.push(s);
  console.log(s);
};

/** O CloudGym limita requisições: uma ficha por vez, com folga. */
const fichas = new Map<number, CgCliente>();
async function ficha(id: number): Promise<CgCliente> {
  const ja = fichas.get(id);
  if (ja) return ja;
  await new Promise((r) => setTimeout(r, 700));
  const c = await obterCliente(id);
  fichas.set(id, c);
  return c;
}

/** Contrato vigente: não encerrado, cobrindo hoje; senão o de fim mais distante. */
function contratoVigente(c: CgCliente): CgContrato | null {
  const vivos = c.contracts.filter((x) => !CONTRATO_ENCERRADO.has(x.status));
  const cobrindo = vivos.filter((x) => x.startDate.slice(0, 10) <= hojeISO && x.endDate.slice(0, 10) >= hojeISO);
  const ordem = (xs: CgContrato[]) => [...xs].sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
  return ordem(cobrindo) ?? ordem(vivos);
}

/** Parcelas abertas e vencidas de lá (contratos não cancelados), da mais antiga. */
function parcelasVencidas(c: CgCliente) {
  return c.contracts
    .filter((x) => x.status !== "canceled")
    .flatMap((x) => x.payments)
    .filter((p) => p.status === "overdue" || (p.status === null && p.dueDate.slice(0, 10) < hojeISO))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

async function main() {
  log(`Conciliação Coliseu × CloudGym — ${APLICAR ? "APLICANDO" : "prévia (use --aplicar para gravar)"} — ${new Date().toISOString()}`);

  const ativosCg = await listarClientes("active");
  const inativosCg = await listarClientes("inactive");
  const pendencias = await pendenciasDePagamento();
  log(`CloudGym: ${ativosCg.length} ativos, ${inativosCg.length} inativos, ${pendencias.length} com parcela vencida`);
  const statusCg = new Map<number, string>();
  for (const c of inativosCg) statusCg.set(c.id, "inactive");
  for (const c of ativosCg) statusCg.set(c.id, "active");
  const cpfCg = new Map<string, number[]>();
  for (const c of [...ativosCg, ...inativosCg]) {
    const cpf = so(c.cpf);
    if (cpf.length === 11) cpfCg.set(cpf, [...(cpfCg.get(cpf) ?? []), c.id]);
  }

  const pessoas = await prisma.person.findMany({
    where: { OR: [{ legacyCloudgymId: { not: null } }, { cpf: { not: null } }, { memberships: { some: {} } }] },
    select: {
      id: true,
      codigo: true,
      nome: true,
      cpf: true,
      fase: true,
      legacyCloudgymId: true,
      memberships: { orderBy: { matriculadoEm: "desc" }, select: { id: true, status: true, vencimentoPlano: true, matriculadoEm: true } },
      billingCustomer: { select: { id: true, subscriptions: { where: { status: "ACTIVE" }, select: { asaasSubscriptionId: true } } } },
      _count: { select: { deviceMappings: true } },
    },
  });
  const porLegado = new Map<number, (typeof pessoas)[number]>();
  const porCpf = new Map<string, (typeof pessoas)[number][]>();
  for (const p of pessoas) {
    if (p.legacyCloudgymId) porLegado.set(p.legacyCloudgymId, p);
    const cpf = so(p.cpf);
    if (cpf.length === 11) porCpf.set(cpf, [...(porCpf.get(cpf) ?? []), p]);
  }
  /** Id do aluno no CloudGym: o legado, ou o CPF se lá houver um só. */
  const idCg = (p: (typeof pessoas)[number]): number | null => {
    if (p.legacyCloudgymId && statusCg.has(p.legacyCloudgymId)) return p.legacyCloudgymId;
    const achados = cpfCg.get(so(p.cpf)) ?? [];
    return achados.length === 1 ? achados[0] : (p.legacyCloudgymId ?? null);
  };
  const pessoaDoCg = (c: { id: number; cpf: string | null }) => {
    const l = porLegado.get(c.id);
    if (l) return l;
    const xs = porCpf.get(so(c.cpf)) ?? [];
    return xs.length === 1 ? xs[0] : null;
  };

  const planos = await prisma.plan.findMany({ where: { legacyCloudgymId: { not: null } }, select: { id: true, nome: true, legacyCloudgymId: true } });
  const planoPorCg = new Map(planos.map((p) => [p.legacyCloudgymId!, p]));
  const unidade = await prisma.unit.findFirstOrThrow({ select: { id: true } });
  const [{ maior }] = await prisma.$queryRaw<{ maior: number }[]>`
    SELECT coalesce(max(nullif(regexp_replace(codigo, '[^0-9]', '', 'g'), '')::bigint), 0)::int AS maior FROM "Person"`;
  let proximoCodigo = maior;

  const contagem = { cadastrados: 0, matriculados: 0, renovados: 0, prorrogados: 0, expirados: 0, bloqueados: 0, semPlano: 0, parcelasAtualizadas: 0, parcelasCriadas: 0 };

  /* ------------------------------------------------ ativos do CloudGym */
  log("\n== Ativos no CloudGym");
  for (const c of ativosCg) {
    let p = pessoaDoCg(c);
    const ultima = p?.memberships[0];
    if (p && ultima?.status === "ACTIVE") {
      // Já ativo aqui: só acompanha a renovação feita lá (vencimento que avança).
      const fim = dia(c.endDate);
      const renovaSozinho = (p.billingCustomer?.subscriptions ?? []).some((s) => ehIdAsaasReal(s.asaasSubscriptionId));
      if (fim && !renovaSozinho && fim > ultima.vencimentoPlano) {
        contagem.prorrogados++;
        if (APLICAR) await prisma.membership.update({ where: { id: ultima.id }, data: { vencimentoPlano: fim } });
      }
      continue;
    }
    if (ultima && ultima.status !== "EXPIRED" && ultima.status !== "CANCELED" && ultima.status !== "SUSPENDED") {
      log(`  ? ${c.id} ${c.name.trim()}: matrícula ${ultima.status} no Coliseu (${p!.codigo}) — não mexi`);
      continue;
    }
    const cg = await ficha(c.id);
    const contrato = contratoVigente(cg);
    const plano = contrato ? planoPorCg.get(contrato.plan) : undefined;
    if (!contrato || !plano) {
      contagem.semPlano++;
      log(`  ! ${c.id} ${c.name.trim()}: ${contrato ? `plano ${contrato.plan} não existe no Coliseu` : "sem contrato vigente"} — não matriculei`);
      continue;
    }
    if (!p) {
      contagem.cadastrados++;
      const id = porLegado.has(c.id) ? undefined : `cgp_${c.id}`;
      const dados = dadosDaPessoa(c, unidade.id, `CD${String(++proximoCodigo).padStart(5, "0")}`);
      log(`  + ${c.id} ${c.name.trim()}: cadastrado ${dados.codigo} e matriculado em "${plano.nome}" até ${contrato.endDate.slice(0, 10)}`);
      if (APLICAR) {
        const existe = id ? await prisma.person.findUnique({ where: { id }, select: { id: true } }) : null;
        const criado = await prisma.person.create({ data: { ...(id && !existe ? { id } : {}), ...dados }, select: { id: true } });
        p = { id: criado.id } as (typeof pessoas)[number];
      }
    } else {
      contagem[ultima ? "renovados" : "matriculados"]++;
      log(`  ${ultima ? "↻" : "+"} ${c.id} ${c.name.trim()} (${p.codigo}): ${ultima ? "renovado" : "matriculado"} em "${plano.nome}" até ${contrato.endDate.slice(0, 10)}`);
      if (APLICAR && p.fase !== "aluno") await prisma.person.update({ where: { id: p.id }, data: { fase: "aluno", estagio: null } });
    }
    if (APLICAR && p) {
      await prisma.membership.create({
        data: {
          personId: p.id,
          planId: plano.id,
          status: "ACTIVE",
          matriculadoEm: dia(contrato.startDate) ?? new Date(),
          vencimentoPlano: dia(contrato.endDate) ?? new Date(),
          ultimaPresenca: dia(contrato.startDate) ?? new Date(),
          courtesyEntriesLeft: 0,
        },
      });
    }
  }

  /* ------------------------------------------- ativos aqui, inativos lá */
  log("\n== Ativos no Coliseu e inativos no CloudGym");
  const ativosCgIds = new Set(ativosCg.map((c) => c.id));
  for (const p of pessoas) {
    const ultima = p.memberships[0];
    if (ultima?.status !== "ACTIVE") continue;
    const id = idCg(p);
    if (id && ativosCgIds.has(id)) continue;
    if (!id || !statusCg.has(id)) {
      log(`  ? ${p.codigo} ${p.nome}: não existe no CloudGym — não mexi`);
      continue;
    }
    if (ultima.matriculadoEm >= ESPELHO_DESDE) {
      log(`  ? ${p.codigo} ${p.nome}: matriculado no Coliseu em ${ultima.matriculadoEm.toISOString().slice(0, 10)} (depois do espelho) — não mexi`);
      continue;
    }
    contagem.expirados++;
    log(`  - ${p.codigo} ${p.nome} (CloudGym ${id}): inativo lá — matrícula expirada`);
    if (!APLICAR) continue;
    await prisma.membership.updateMany({ where: { personId: p.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (p._count.deviceMappings > 0) {
      await recalcularAcessoDePessoa(p.id);
      contagem.bloqueados++;
    }
  }

  /* --------------------------------------------------------- inadimplência */
  log("\n== Parcelas (inadimplência)");
  const abertasAqui = await prisma.payment.findMany({
    where: { status: { in: ["PENDING", "OVERDUE"] }, asaasPaymentId: { startsWith: "cg_pay_" } },
    select: { id: true, asaasPaymentId: true, personId: true, status: true },
  });
  const alvo = new Map<number, string>(); // id CloudGym → personId
  for (const pend of pendencias) {
    const p = pessoaDoCg({ id: pend.memberId, cpf: pend.cpf });
    if (p) alvo.set(pend.memberId, p.id);
    else log(`  ? ${pend.memberId} ${pend.name.trim()}: deve no CloudGym e não existe no Coliseu`);
  }
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  for (const a of abertasAqui) {
    const p = a.personId ? pessoaPorId.get(a.personId) : undefined;
    const id = p ? idCg(p) : null;
    if (p && id) alvo.set(id, p.id);
  }
  for (const [id, personId] of alvo) {
    const cg = await ficha(id);
    const todas = new Map(cg.contracts.flatMap((x) => x.payments.map((pg) => [pg.id, { ...pg, contratoCancelado: x.status === "canceled" }] as const)));
    // 1) parcela importada: o status de hoje lá
    for (const a of abertasAqui.filter((x) => x.personId === personId)) {
      const lá = todas.get(Number(a.asaasPaymentId.slice(7)));
      if (!lá) continue;
      const status =
        lá.status === "paid" ? "PAID"
        : lá.status === "canceled" || lá.contratoCancelado ? "CANCELED"
        : lá.dueDate.slice(0, 10) < hojeISO ? "OVERDUE"
        : "PENDING";
      if (status === a.status) continue;
      contagem.parcelasAtualizadas++;
      log(`  ~ ${id}: parcela ${a.asaasPaymentId} ${a.status} → ${status}`);
      if (APLICAR) {
        await prisma.payment.update({
          where: { id: a.id },
          data: { status, statusUpdatedAt: new Date(), ...(status === "PAID" && { paidAt: dia(lá.cashBookDate ?? lá.dueDate) }) },
        });
      }
    }
    // 2) a vencida mais antiga de lá tem de existir aqui
    const vencida = parcelasVencidas(cg)[0];
    if (!vencida) continue;
    const chave = `cg_pay_${vencida.id}`;
    const ja = await prisma.payment.findUnique({ where: { asaasPaymentId: chave }, select: { status: true } });
    if (ja && ja.status === "OVERDUE") continue;
    contagem.parcelasCriadas++;
    log(`  + ${id}: parcela vencida ${vencida.dueDate.slice(0, 10)} R$ ${vencida.amount}${ja ? ` (estava ${ja.status})` : ""}`);
    if (!APLICAR) continue;
    const cus = await prisma.billingCustomer.upsert({
      where: { personId },
      create: { asaasCustomerId: `cg_cus_${id}`, personId },
      update: {},
      select: { id: true },
    });
    const sub = await prisma.billingSubscription.upsert({
      where: { asaasSubscriptionId: `cg_sub_${id}` },
      create: { asaasSubscriptionId: `cg_sub_${id}`, customerId: cus.id, value: vencida.amount, status: "ACTIVE" },
      update: {},
      select: { id: true },
    });
    const pay = {
      subscriptionId: sub.id,
      personId,
      value: vencida.amount,
      dueDate: dia(vencida.dueDate)!,
      status: "OVERDUE" as const,
      paidAt: null,
      statusUpdatedAt: new Date(),
    };
    await prisma.payment.upsert({ where: { asaasPaymentId: chave }, create: { asaasPaymentId: chave, ...pay }, update: pay });
  }

  log("\n== Resumo");
  log(JSON.stringify(contagem, null, 2));
  writeFileSync(RELATORIO, linhas.join("\n"), "utf8");
  console.log(`\nRelatório em ${RELATORIO}`);
}

function dadosDaPessoa(c: CgClienteLista, unitId: string, codigo: string) {
  const cpf = so(c.cpf);
  const fone = so(c.cellPhoneNumber);
  return {
    codigo,
    nome: c.name.trim(),
    legacyCloudgymId: c.id,
    legacyName: c.name,
    fase: "aluno" as const,
    origem: origemDoColiseu(c.source),
    origemLegado: c.source,
    unitId,
    cpf: cpf.length === 11 ? cpf : null,
    email: c.email?.trim() || null,
    telefone: fone.startsWith("55") && fone.length > 11 ? fone.slice(2) : fone || null,
    rg: c.rg?.trim() || null,
    dataNascimento: c.birthDay ? c.birthDay.slice(0, 10) : null,
    genero: c.gender === "M" || c.gender === "F" ? c.gender : null,
    cep: c.zipCode?.trim() || null,
    cidade: c.city?.trim() || null,
    estado: c.state?.trim() || null,
    cadastroLegado: dia(c.creationDate),
    criadoEm: dia(c.creationDate) ?? new Date(),
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
