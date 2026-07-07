import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { enfileirarUpsertUser } from "@/lib/repositories/access";

/**
 * Provisionamento automático (Fase 6-A): garante que um ALUNO exista nas catracas
 * da unidade — aloca o externalUserId, cria DeviceUserMapping (PENDING) e enfileira
 * UPSERT_USER (desabilitado; o ENABLE vem da política após o pagamento).
 * Idempotente: chamadas repetidas não duplicam mapping nem comando.
 */
export async function provisionarAcessoDePessoa(
  personId: string,
): Promise<{ mappingsCriados: number; comandos: number }> {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person || person.fase !== "aluno") return { mappingsCriados: 0, comandos: 0 };

  const devices = await prisma.accessDevice.findMany({ where: { unitId: person.unitId } });
  if (devices.length === 0) return { mappingsCriados: 0, comandos: 0 };

  const existentes = await prisma.deviceUserMapping.findMany({ where: { personId } });

  // Mesmo id em todas as catracas da pessoa: reusa o já alocado ou pega o próximo.
  let externalUserId = existentes[0]?.externalUserId ?? null;

  let mappingsCriados = 0;
  for (const device of devices) {
    if (existentes.some((m) => m.deviceId === device.id)) continue;
    const criado = await criarMappingComRetry(device.id, personId, externalUserId);
    externalUserId = criado.externalUserId;
    mappingsCriados++;
  }

  // Enfileira UPSERT para todo mapping ainda não sincronizado (novos e pendentes antigos).
  const pendentes = await prisma.deviceUserMapping.findMany({
    where: { personId, syncStatus: { not: "IN_SYNC" } },
  });
  let comandos = 0;
  for (const m of pendentes) {
    await enfileirarUpsertUser({
      deviceId: m.deviceId, personId, externalUserId: m.externalUserId, nome: person.nome,
    });
    comandos++;
  }
  return { mappingsCriados, comandos };
}

/** Próximo externalUserId global: max numérico + 1 (piso 1000 → primeiro id real 1001). */
async function proximoExternalUserId(): Promise<string> {
  const todos = await prisma.deviceUserMapping.findMany({ select: { externalUserId: true } });
  const max = todos.reduce((m, r) => {
    const n = Number(r.externalUserId);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 1000);
  return String(max + 1);
}

/**
 * Cria o mapping tratando corrida de alocação: se duas matrículas simultâneas pegarem
 * o mesmo id, o unique (deviceId, externalUserId) estoura P2002 e realocamos.
 */
async function criarMappingComRetry(deviceId: string, personId: string, extId: string | null) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const externalUserId = extId ?? (await proximoExternalUserId());
    try {
      return await prisma.deviceUserMapping.create({
        data: { deviceId, personId, externalUserId, syncStatus: "PENDING" },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // corrida: (deviceId, personId) já criado por outra chamada → reusa;
        // (deviceId, externalUserId) colidiu → realoca no próximo loop.
        const jaExiste = await prisma.deviceUserMapping.findUnique({
          where: { deviceId_personId: { deviceId, personId } },
        });
        if (jaExiste) return jaExiste;
        extId = null;
        continue;
      }
      throw e;
    }
  }
  throw new Error(`não consegui alocar externalUserId para ${personId} em ${deviceId}`);
}
