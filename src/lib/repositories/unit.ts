import { prisma } from "@/lib/db";

/**
 * Resolve a unidade do tenant. O app é single-tenant: usa a unit mais antiga
 * do banco, sem depender de slug fixo — em produção ela nasce no bootstrap do
 * primeiro admin (slug "matriz"); no seed de dev, "coliseu-team".
 */
export async function unitIdAtual(): Promise<string> {
  const u = await prisma.unit.findFirst({ orderBy: { createdAt: "asc" } });
  if (!u) {
    throw new Error("Nenhuma unidade cadastrada — crie o primeiro admin para inicializar o banco.");
  }
  return u.id;
}
