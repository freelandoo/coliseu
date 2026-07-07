import { prisma } from "@/lib/db";
import { enfileirarRemoveUser } from "@/lib/repositories/access";

/**
 * Exclusão LGPD (Fase 6): apaga a pessoa DAS CATRACAS — enfileira REMOVE_USER
 * por device mapeado, revoga credenciais e apaga os mappings. Deve rodar ANTES
 * de deletar a Person (o cascade levaria os mappings junto e o externalUserId
 * se perderia); o comando não tem FK com Person, então sobrevive ao delete e
 * o agente remove o usuário do device mesmo com o cadastro já apagado do CRM.
 */
export async function removerAcessoDePessoa(personId: string): Promise<{ comandos: number }> {
  const mappings = await prisma.deviceUserMapping.findMany({ where: { personId } });

  // Cancela provisionamento/habilitação ainda na fila: um UPSERT ou ENABLE
  // pendente executado depois do REMOVE recriaria/reativaria o usuário no device.
  await prisma.deviceCommand.updateMany({
    where: { personId, status: { in: ["PENDING", "DISPATCHED"] }, type: { not: "REMOVE_USER" } },
    data: { status: "FAILED", lastError: "superseded by REMOVE_USER (exclusão LGPD)" },
  });

  let comandos = 0;
  for (const m of mappings) {
    await enfileirarRemoveUser({
      deviceId: m.deviceId, personId, externalUserId: m.externalUserId,
    });
    comandos++;
  }

  await prisma.accessCredential.updateMany({
    where: { personId, status: { not: "REVOKED" } },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await prisma.deviceUserMapping.deleteMany({ where: { personId } });
  return { comandos };
}
