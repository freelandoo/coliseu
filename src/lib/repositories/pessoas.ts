import { prisma } from "@/lib/db";
import { toPessoa } from "@/lib/repositories/mappers";
import { contaComoAtivo } from "@/lib/billing/regua";
import type { LeadEstagio, NovaPessoa, Pessoa, PessoaFase } from "@/lib/types";
import type { AsaasMatricula } from "@/lib/asaas";
import { upsertBillingCustomerRepo, upsertBillingSubscriptionRepo, upsertPaymentRepo } from "@/lib/repositories/billing";
import { unitIdAtual } from "@/lib/repositories/unit";
import { ehPlanoGratuito } from "@/lib/billing/parcelamento";

const withMemberships = {
  memberships: {
    orderBy: { matriculadoEm: "desc" as const },
    take: 1,
    include: { matriculadoPor: { select: { nome: true } } },
  },
  // Régua de cobrança: a parcela aberta mais antiga e se há assinatura que renove sozinha.
  payments: {
    where: { status: { in: ["PENDING" as const, "OVERDUE" as const] } },
    orderBy: { dueDate: "asc" as const },
    take: 1,
    select: { dueDate: true, value: true, invoiceUrl: true },
  },
  billingCustomer: {
    select: { subscriptions: { where: { status: "ACTIVE" }, select: { asaasSubscriptionId: true } } },
  },
};

export async function proximoCodigoRepo(): Promise<string> {
  // Maior parte numérica dos códigos, calculada no banco: com o histórico do
  // CloudGym são 15 mil cadastros, e lê-los todos custava ~250 ms por cadastro.
  const [r] = await prisma.$queryRaw<{ maior: number }[]>`
    SELECT coalesce(max(nullif(regexp_replace(codigo, '[^0-9]', '', 'g'), '')::bigint), 0)::int AS maior
    FROM "Person"`;
  return `CD${String((r?.maior ?? 0) + 1).padStart(5, "0")}`;
}

/**
 * Pessoas das telas do dia a dia. Ex-alunos do histórico do CloudGym (13 mil)
 * ficam sempre de fora — o Analytics lê direto. `fases` recorta no banco: a
 * lista de alunos não precisa trazer os leads junto para descartá-los depois.
 */
export async function listarPessoasRepo(fases?: Exclude<PessoaFase, "exaluno">[]): Promise<Pessoa[]> {
  const rows = await prisma.person.findMany({
    where: { fase: fases ? { in: fases } : { not: "exaluno" } },
    include: withMemberships,
    orderBy: { criadoEm: "desc" },
  });
  return rows.map(toPessoa);
}

/**
 * Leads por estágio, contados no banco. Lead sem estágio gravado conta como
 * "novo" — o mesmo que `listarLeads` mostra na Captação.
 */
export async function contarLeadsPorEstagioRepo(): Promise<Record<LeadEstagio, number>> {
  const grupos = await prisma.person.groupBy({ by: ["estagio"], where: { fase: "lead" }, _count: { _all: true } });
  const total: Record<LeadEstagio, number> = { novo: 0, qualificado: 0, interesse: 0, convertido: 0, perdido: 0 };
  for (const g of grupos) total[(g.estagio ?? "novo") as LeadEstagio] += g._count._all;
  return total;
}

/**
 * Alunos que contam como ativos — o mesmo critério do filtro "Ativos" da lista
 * (`contaComoAtivo`: em dia ou inadimplente, como no CloudGym). A régua depende
 * da parcela aberta e do vencimento do plano, por isso a conta é a da lista.
 */
export async function contarAlunosAtivosRepo(): Promise<number> {
  return (await listarPessoasRepo(["aluno"])).filter((p) => contaComoAtivo(p.status)).length;
}

export async function obterPessoaRepo(id: string): Promise<Pessoa | undefined> {
  const row = await prisma.person.findUnique({ where: { id }, include: withMemberships });
  return row ? toPessoa(row) : undefined;
}

export async function criarPessoaRepo(input: NovaPessoa): Promise<Pessoa> {
  const row = await prisma.person.create({
    data: {
      codigo: await proximoCodigoRepo(),
      nome: input.nome.trim(),
      telefone: input.telefone?.trim() || null,
      email: input.email?.trim() || null,
      cpf: input.cpf?.trim() || null,
      rg: input.rg?.trim() || null,
      vendedor: input.vendedor?.trim() || null,
      origem: input.origem,
      fase: "lead",
      estagio: "novo",
      dataNascimento: input.dataNascimento || null,
      cep: input.endereco?.cep || null,
      estado: input.endereco?.estado || null,
      cidade: input.endereco?.cidade || null,
      rua: input.endereco?.rua || null,
      numero: input.endereco?.numero || null,
      unitId: await unitIdAtual(),
    },
    include: withMemberships,
  });
  return toPessoa(row);
}

export async function atualizarPessoaRepo(
  id: string,
  patch: Partial<Pessoa>,
): Promise<Pessoa | undefined> {
  const exists = await prisma.person.findUnique({ where: { id } });
  if (!exists) return undefined;
  const row = await prisma.person.update({
    where: { id },
    data: {
      nome: patch.nome,
      telefone: patch.telefone,
      email: patch.email,
      cpf: patch.cpf,
      rg: patch.rg,
      vendedor: patch.vendedor,
      estagio: patch.estagio,
      motivoPerdido: patch.motivoPerdido,
      dataNascimento: patch.dataNascimento,
      cep: patch.endereco?.cep,
      estado: patch.endereco?.estado,
      cidade: patch.endereco?.cidade,
      rua: patch.endereco?.rua,
      numero: patch.endereco?.numero,
    },
    include: withMemberships,
  });
  return toPessoa(row);
}

export async function removerPessoaRepo(id: string): Promise<boolean> {
  const exists = await prisma.person.findUnique({ where: { id } });
  if (!exists) return false;
  // LGPD: apaga das catracas ANTES do delete (o cascade levaria os mappings e
  // o externalUserId se perderia — o usuário ficaria órfão no device).
  const { removerAcessoDePessoa } = await import("@/lib/access/deprovision");
  await removerAcessoDePessoa(id);
  await prisma.person.delete({ where: { id } });
  return true;
}

/**
 * Transição lead → aluno: cria Membership + cobrança pendente. Plano gratuito
 * (R$ 0, ex.: "FREE PASS") não tem o que cobrar: a matrícula nasce ativa e sem
 * cobrança — o Asaas recusa assinatura de valor zero.
 */
export async function matricularPessoaRepo(
  id: string,
  planoId: string,
  asaas?: AsaasMatricula,
  /** Quem clicou em matricular — fica gravado na matrícula. */
  matriculadoPorId?: string,
): Promise<Pessoa | undefined> {
  const person = await prisma.person.findUnique({ where: { id } });
  const plano = await prisma.plan.findUnique({ where: { id: planoId } });
  if (!person || !plano) return undefined;

  const agora = new Date();
  const venc = new Date(agora);
  venc.setDate(venc.getDate() + plano.duracaoDias);
  const gratuito = ehPlanoGratuito(plano);

  await prisma.$transaction([
    prisma.person.update({ where: { id }, data: { fase: "aluno", estagio: null } }),
    prisma.membership.create({
      data: {
        personId: id, planId: planoId, status: gratuito ? "ACTIVE" : "PENDING_PAYMENT",
        matriculadoEm: agora, vencimentoPlano: venc, ultimaPresenca: agora,
        matriculadoPorId: matriculadoPorId ?? null,
      },
    }),
    ...(gratuito
      ? []
      : [
          prisma.cobranca.create({
            data: {
              personId: id, tipo: "matricula", valor: asaas?.valorCobranca ?? plano.valorMensal,
              vencimento: venc, status: "pendente",
              asaasId: asaas?.cobrancaId ?? null,
              assinaturaId: asaas?.assinaturaId ?? null,
              linkPagamento: asaas?.linkPagamento ?? null,
            },
          }),
        ]),
  ]);

  if (asaas) {
    const membership = await prisma.membership.findFirst({
      where: { personId: id },
      orderBy: { matriculadoEm: "desc" },
    });
    const bc = await upsertBillingCustomerRepo({
      asaasCustomerId: asaas.customerId, personId: id, externalReference: id,
    });
    const bs = await upsertBillingSubscriptionRepo({
      asaasSubscriptionId: asaas.assinaturaId, customerId: bc.id, value: asaas.valorCobranca ?? plano.valorMensal,
      cycle: asaas.ciclo, externalReference: membership?.id ?? null,
    });
    // statusUpdatedAt no passado: o webhook do Asaas (que pode chegar antes
    // desta linha) sempre prevalece sobre a criação local.
    await upsertPaymentRepo({
      asaasPaymentId: asaas.cobrancaId, subscriptionId: bs.id, personId: id,
      value: asaas.valorCobranca ?? plano.valorMensal,
      dueDate: venc, status: "PENDING", invoiceUrl: asaas.linkPagamento,
      statusUpdatedAt: new Date(0),
    });
  }

  // Fase 6-A: provisiona o aluno nas catracas da unidade (mapping + UPSERT_USER
  // desabilitado). Best-effort: falha aqui não pode derrubar a matrícula — o
  // recalcularAcessoDePessoa do primeiro pagamento re-provisiona (idempotente).
  try {
    const { provisionarAcessoDePessoa } = await import("@/lib/access/provision");
    await provisionarAcessoDePessoa(id);
  } catch (e) {
    console.error("[matricula] provisionamento de acesso falhou:", e);
  }
  // Sem pagamento para disparar a liberação, o gratuito libera já.
  if (gratuito) {
    try {
      const { recalcularAcessoDePessoa } = await import("@/lib/access/outbox");
      await recalcularAcessoDePessoa(id);
    } catch (e) {
      console.error("[matricula] liberação do plano gratuito falhou:", e);
    }
  }

  return obterPessoaRepo(id);
}

export interface PessoaAchada {
  id: string;
  codigo: string;
  nome: string;
  fase: string;
  cpf: string | null;
  telefone: string | null;
}

const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";

/**
 * Busca em TODOS os cadastros (aluno, lead, ex-aluno) — o que escapa das listas
 * do dia a dia. Mesma regra de `casaPessoa`: número procura CPF, telefone e
 * código; texto procura nome (sem acento) e código.
 */
export async function buscarPessoasRepo(termo: string, limite = 8): Promise<PessoaAchada[]> {
  const t = termo.trim();
  const d = t.replace(/\D/g, "");
  const soNumero = !/\p{L}/u.test(t);
  if (soNumero) {
    if (d.length < 3) return [];
    return prisma.$queryRaw<PessoaAchada[]>`
      SELECT id, codigo, nome, fase::text AS fase, cpf, telefone FROM "Person"
      WHERE regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') LIKE ${`%${d}%`}
         OR regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g') LIKE ${`%${d}%`}
         OR regexp_replace(codigo, '[^0-9]', '', 'g') LIKE ${`%${d}%`}
      ORDER BY (fase = 'exaluno'), "criadoEm" DESC
      LIMIT ${limite}`;
  }
  if (t.length < 2) return [];
  const n = t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return prisma.$queryRaw<PessoaAchada[]>`
    SELECT id, codigo, nome, fase::text AS fase, cpf, telefone FROM "Person"
    WHERE translate(lower(nome), ${COM_ACENTO}, ${SEM_ACENTO}) LIKE ${`%${n}%`}
       OR lower(codigo) LIKE ${`%${n}%`}
    ORDER BY (fase = 'exaluno'), "criadoEm" DESC
    LIMIT ${limite}`;
}

/** Cadastro que já tem este CPF (comparando só dígitos). */
export async function pessoaComCpfRepo(cpf: string, ignorarId?: string): Promise<PessoaAchada | null> {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return null;
  const [p] = await prisma.$queryRaw<PessoaAchada[]>`
    SELECT id, codigo, nome, fase::text AS fase, cpf, telefone FROM "Person"
    WHERE regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g') = ${d}
      AND id <> ${ignorarId ?? ""}
    ORDER BY (fase = 'exaluno'), "criadoEm" DESC
    LIMIT 1`;
  return p ?? null;
}
