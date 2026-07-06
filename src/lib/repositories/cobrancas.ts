import { prisma } from "@/lib/db";
import { toCobranca } from "@/lib/repositories/mappers";
import type { Cobranca } from "@/lib/types";

export async function listarCobrancasRepo(): Promise<Cobranca[]> {
  const rows = await prisma.cobranca.findMany();
  return rows.map(toCobranca);
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
