import { prisma } from "@/lib/db";
import { toCobranca } from "@/lib/repositories/mappers";
import type { Cobranca, CobrancaStatus } from "@/lib/types";

export async function listarCobrancasRepo(status?: CobrancaStatus[]): Promise<Cobranca[]> {
  const rows = await prisma.cobranca.findMany(status ? { where: { status: { in: status } } } : undefined);
  return rows.map(toCobranca);
}

export interface CobrancasEmAberto {
  /** pendente + atrasado */
  quantidade: number;
  valor: number;
  atrasadas: { quantidade: number; valor: number };
}

/**
 * Cobranças em aberto pelo status gravado — o mesmo critério da tela de
 * Cobrança (pendente = a vencer, atrasado = vencida sem pagamento). É o que
 * falta receber, não receita nem caixa.
 */
export async function cobrancasEmAbertoRepo(): Promise<CobrancasEmAberto> {
  const grupos = await prisma.cobranca.groupBy({
    by: ["status"],
    where: { status: { in: ["pendente", "atrasado"] } },
    _count: { _all: true },
    _sum: { valor: true },
  });
  const de = (s: "pendente" | "atrasado") => grupos.find((g) => g.status === s);
  const pendente = de("pendente");
  const atrasado = de("atrasado");
  const qtd = (g: typeof pendente) => g?._count._all ?? 0;
  const soma = (g: typeof pendente) => g?._sum.valor ?? 0;
  return {
    quantidade: qtd(pendente) + qtd(atrasado),
    valor: soma(pendente) + soma(atrasado),
    atrasadas: { quantidade: qtd(atrasado), valor: soma(atrasado) },
  };
}

export async function marcarCobrancaPagaRepo(asaasId: string): Promise<boolean> {
  const c = await prisma.cobranca.findFirst({ where: { asaasId } });
  if (!c) return false;
  await prisma.$transaction([
    prisma.cobranca.update({ where: { id: c.id }, data: { status: "pago" } }),
    prisma.membership.updateMany({ where: { personId: c.personId }, data: { status: "ACTIVE" } }),
  ]);
  return true;
}

export async function marcarCobrancaAtrasadaRepo(asaasId: string): Promise<boolean> {
  const c = await prisma.cobranca.findFirst({ where: { asaasId } });
  if (!c) return false;
  await prisma.$transaction([
    prisma.cobranca.update({ where: { id: c.id }, data: { status: "atrasado" } }),
    prisma.membership.updateMany({ where: { personId: c.personId }, data: { status: "SUSPENDED" } }),
  ]);
  return true;
}
