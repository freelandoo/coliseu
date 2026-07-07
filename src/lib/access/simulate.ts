import { prisma } from "@/lib/db";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import { carregarContextoAcesso } from "@/lib/access/context";
import { ingestarEvento } from "@/lib/agent/ingest";
import type { AccessDecision } from "@/lib/access/types";

export interface FaceCheckResult {
  personId: string;
  nome: string;
  allow: boolean;
  status: AccessDecision["status"];
  reason: AccessDecision["reason"];
  physicallyPassed: boolean; // catraca girou?
  deviceName: string | null;
  consumiuCortesia: boolean;
}

/**
 * Simula um "face check" na catraca: reconhece a face de uma pessoa, avalia a política
 * de acesso REAL (`evaluateAccessEligibility`) e registra o giro resultante como um
 * AccessEvent — ALLOWED (catraca gira) ou DENIED (bloqueia) — igual a um acesso de verdade.
 * Serve para testar o fluxo ponta a ponta sem o hardware na rede.
 */
export async function simularFaceCheck(personId: string): Promise<FaceCheckResult> {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { nome: true } });
  if (!person) throw new Error("Pessoa não encontrada");

  const { ctx, membership, mappings } = await carregarContextoAcesso(personId);
  // Simulador de "face aprovada": assume a face reconhecida (enrolled + sincronizada) para
  // testar a decisão de CONTRATO/FINANCEIRO — é isso que decide se a catraca libera.
  const decisao = evaluateAccessEligibility({ ...ctx, temCredencialEnrolled: true, sincronizado: true });

  // Device/credencial que o iDFace "reconheceu": usa o mapeamento da pessoa quando existe;
  // senão cai na catraca principal só para registrar o evento.
  const mapping = mappings[0] ?? null;
  const device = mapping
    ? await prisma.accessDevice.findUnique({ where: { id: mapping.deviceId }, select: { id: true, name: true } })
    : await prisma.accessDevice.findFirst({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  if (device) {
    await ingestarEvento({
      deviceId: device.id,
      deviceEventId: `sim-${personId}-${Date.now()}`,
      personId, // linka direto à pessoa simulada (mesmo sem mapping de device)
      externalUserId: mapping?.externalUserId,
      deviceTime: new Date().toISOString(),
      direction: "ENTRY",
      decision: decisao.allow ? "ALLOWED" : "DENIED",
      reason: decisao.reason,
      physicallyPassed: decisao.allow, // só gira quando libera
      mode: "ONLINE",
    });
  }

  // Cortesia consumida na liberação (1 crédito) — mesmo efeito de um giro online real.
  let consumiuCortesia = false;
  if (decisao.consumirCortesia && membership && membership.courtesyEntriesLeft > 0) {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { courtesyEntriesLeft: { decrement: 1 } },
    });
    consumiuCortesia = true;
  }

  return {
    personId,
    nome: person.nome,
    allow: decisao.allow,
    status: decisao.status,
    reason: decisao.reason,
    physicallyPassed: decisao.allow,
    deviceName: device?.name ?? null,
    consumiuCortesia,
  };
}
