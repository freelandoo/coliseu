import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { registrarAudit } from "@/lib/access/audit";

export const FREELANDOO_PROVIDER = "freelandoo";

export function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export type StatusTokenFreelandoo = {
  exists: boolean;
  createdAt: string | null;
  createdByNome: string | null;
  lastUsedAt: string | null;
};

/** Gera (ou rotaciona) o token da Gym Provider API. Retorna o valor em claro — única vez que ele existe fora da memória. */
export async function gerarTokenFreelandoo(actorUserId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const anterior = await prisma.apiToken.findUnique({ where: { provider: FREELANDOO_PROVIDER } });
  const row = await prisma.apiToken.upsert({
    where: { provider: FREELANDOO_PROVIDER },
    update: { tokenHash: sha256Hex(token), createdAt: new Date(), createdById: actorUserId, lastUsedAt: null },
    create: { provider: FREELANDOO_PROVIDER, tokenHash: sha256Hex(token), createdById: actorUserId },
  });
  await registrarAudit({
    actorType: "USER",
    actorId: actorUserId,
    action: "freelandoo_token.rotate",
    entity: "ApiToken",
    entityId: row.id,
    // metadados apenas — nunca token nem hash
    before: anterior ? { createdAt: anterior.createdAt.toISOString(), createdById: anterior.createdById } : null,
    after: { createdAt: row.createdAt.toISOString(), createdById: actorUserId },
  });
  return token;
}

export async function statusTokenFreelandoo(): Promise<StatusTokenFreelandoo> {
  const t = await prisma.apiToken.findUnique({
    where: { provider: FREELANDOO_PROVIDER },
    include: { createdBy: { select: { nome: true } } },
  });
  if (!t) return { exists: false, createdAt: null, createdByNome: null, lastUsedAt: null };
  return {
    exists: true,
    createdAt: t.createdAt.toISOString(),
    createdByNome: t.createdBy.nome,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
  };
}
