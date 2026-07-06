import { prisma } from "@/lib/db";
import { toPessoa } from "@/lib/repositories/mappers";
import type { NovaPessoa, Pessoa } from "@/lib/types";
import type { AsaasMatricula } from "@/lib/asaas";
import { upsertBillingCustomerRepo, upsertBillingSubscriptionRepo, upsertPaymentRepo } from "@/lib/repositories/billing";

const UNIT_SLUG = "coliseu-team";
const withMemberships = { memberships: { orderBy: { matriculadoEm: "desc" as const }, take: 1 } };

async function unitId(): Promise<string> {
  const u = await prisma.unit.findUniqueOrThrow({ where: { slug: UNIT_SLUG } });
  return u.id;
}

export async function proximoCodigoRepo(): Promise<string> {
  const rows = await prisma.person.findMany({ select: { codigo: true } });
  const maior = rows.reduce((max, r) => {
    const n = Number(r.codigo.replace(/\D/g, "")) || 0;
    return n > max ? n : max;
  }, 0);
  return `CD${String(maior + 1).padStart(5, "0")}`;
}

export async function listarPessoasRepo(): Promise<Pessoa[]> {
  const rows = await prisma.person.findMany({ include: withMemberships, orderBy: { criadoEm: "desc" } });
  return rows.map(toPessoa);
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
      origem: input.origem,
      fase: "lead",
      estagio: "novo",
      dataNascimento: input.dataNascimento || null,
      cep: input.endereco?.cep || null,
      estado: input.endereco?.estado || null,
      cidade: input.endereco?.cidade || null,
      rua: input.endereco?.rua || null,
      numero: input.endereco?.numero || null,
      unitId: await unitId(),
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
  await prisma.person.delete({ where: { id } });
  return true;
}

/** Transição lead → aluno: cria Membership + cobrança pendente. */
export async function matricularPessoaRepo(
  id: string,
  planoId: string,
  asaas?: AsaasMatricula,
): Promise<Pessoa | undefined> {
  const person = await prisma.person.findUnique({ where: { id } });
  const plano = await prisma.plan.findUnique({ where: { id: planoId } });
  if (!person || !plano) return undefined;

  const agora = new Date();
  const venc = new Date(agora);
  venc.setMonth(venc.getMonth() + plano.duracaoMeses);

  await prisma.$transaction([
    prisma.person.update({ where: { id }, data: { fase: "aluno", estagio: null } }),
    prisma.membership.create({
      data: {
        personId: id, planId: planoId, status: "PENDING_PAYMENT",
        matriculadoEm: agora, vencimentoPlano: venc, ultimaPresenca: agora,
      },
    }),
    prisma.cobranca.create({
      data: {
        personId: id, tipo: "matricula", valor: plano.valorMensal,
        vencimento: venc, status: "pendente",
        asaasId: asaas?.cobrancaId ?? null,
        assinaturaId: asaas?.assinaturaId ?? null,
        linkPagamento: asaas?.linkPagamento ?? null,
      },
    }),
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
      asaasSubscriptionId: asaas.assinaturaId, customerId: bc.id, value: plano.valorMensal,
      externalReference: membership?.id ?? null,
    });
    await upsertPaymentRepo({
      asaasPaymentId: asaas.cobrancaId, subscriptionId: bs.id, value: plano.valorMensal,
      dueDate: venc, status: "PENDING", invoiceUrl: asaas.linkPagamento,
      statusUpdatedAt: new Date(),
    });
  }

  return obterPessoaRepo(id);
}
