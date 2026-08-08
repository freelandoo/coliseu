import { prisma } from "@/lib/db";
import { inicioDoSlot } from "@/lib/uso";

/**
 * Último bloco já gravado por usuário **neste processo**. A batida chega a cada
 * minuto e cinco batidas caem no mesmo bloco: sem este corte, seriam cinco
 * escritas para gravar a mesma linha. O cache some quando o processo reinicia e
 * some por instância — daí a escrita ser `skipDuplicates` e não um upsert: o
 * banco é quem garante o par único, o cache só evita ida à toa.
 */
const ultimoSlot = new Map<string, number>();

/**
 * Marca o bloco de cinco minutos em que a batida caiu. Idempotente: bater dez
 * vezes no mesmo bloco deixa uma linha só.
 */
export async function registrarPresencaRepo(
  userId: string,
  agora: Date = new Date(),
): Promise<void> {
  const slot = inicioDoSlot(agora);
  if (ultimoSlot.get(userId) === slot.getTime()) return;

  await prisma.presencaSlot.createMany({
    data: [{ userId, slot }],
    skipDuplicates: true,
  });
  // Só depois da escrita: falha de rede tem de deixar a próxima batida tentar.
  ultimoSlot.set(userId, slot.getTime());
}
