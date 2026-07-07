import { prisma } from "@/lib/db";
import type { DeviceCommand } from "@prisma/client";
import { provisionarAcessoDePessoa } from "@/lib/access/provision";
import { enfileirarEnroll } from "@/lib/repositories/access";

export type IniciarCadastroFace =
  | { ok: true; comando: DeviceCommand; externalUserId: string }
  | { ok: false; erro: string };

/**
 * Cadastro de face (Fase 6-B): coloca a credencial FACE em IN_PROGRESS e enfileira
 * o comando ENROLL para a catraca escolhida — o iDFace abre a captura na hora em
 * que o agente entrega o comando. O ack SUCCEEDED (ingest) marca ENROLLED e
 * reavalia a política (aluno pago ganha o ENABLE em seguida).
 * Recadastro é permitido: credencial já ENROLLED não regride (se a captura nova
 * falhar, o aluno não pode perder o acesso que já tinha).
 */
export async function iniciarCadastroFace(input: {
  personId: string; deviceId: string;
}): Promise<IniciarCadastroFace> {
  const person = await prisma.person.findUnique({ where: { id: input.personId } });
  if (!person) return { ok: false, erro: "pessoa não encontrada" };
  if (person.fase !== "aluno") return { ok: false, erro: "apenas alunos têm cadastro de face" };

  // Garante o vínculo com as catracas (idempotente) antes de pedir a captura.
  await provisionarAcessoDePessoa(person.id);

  const mapping = await prisma.deviceUserMapping.findUnique({
    where: { deviceId_personId: { deviceId: input.deviceId, personId: person.id } },
  });
  if (!mapping) return { ok: false, erro: "catraca não encontrada ou fora da unidade do aluno" };

  const credencial = await prisma.accessCredential.findFirst({
    where: { personId: person.id, type: "FACE", status: { not: "REVOKED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!credencial) {
    await prisma.accessCredential.create({
      data: { personId: person.id, type: "FACE", status: "IN_PROGRESS" },
    });
  } else if (credencial.status !== "ENROLLED") {
    await prisma.accessCredential.update({
      where: { id: credencial.id }, data: { status: "IN_PROGRESS" },
    });
  }

  const comando = await enfileirarEnroll({
    deviceId: input.deviceId, personId: person.id,
    externalUserId: mapping.externalUserId, nome: person.nome,
  });
  return { ok: true, comando, externalUserId: mapping.externalUserId };
}
