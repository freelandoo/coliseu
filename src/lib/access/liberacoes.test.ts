import { afterAll, beforeAll, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { listarLiberacoes } from "@/lib/access/liberacoes";
import { enfileirarAbertura } from "@/lib/repositories/access";

let deviceId = "";

beforeAll(async () => {
  const unitId = (await prisma.unit.findFirstOrThrow()).id;
  deviceId = (await prisma.accessDevice.create({ data: { name: "Hist liberar", unitId, status: "ONLINE" } })).id;
});

afterAll(async () => {
  await prisma.accessDevice.delete({ where: { id: deviceId } });
});

test("registra quando, quem liberou, o motivo e o resultado no aparelho", async () => {
  const ok = await enfileirarAbertura({ deviceId, solicitadoPor: "Recepção", motivo: "visitante" });
  await prisma.deviceCommand.update({ where: { id: ok.id }, data: { status: "SUCCEEDED" } });
  const pendente = await enfileirarAbertura({ deviceId, solicitadoPor: "Recepção" });
  const expirada = await enfileirarAbertura({ deviceId, solicitadoPor: "Recepção" });
  await prisma.deviceCommand.update({
    where: { id: expirada.id },
    data: { status: "FAILED", lastError: "expirado: o agente não executou a tempo" },
  });

  const lista = await listarLiberacoes();
  const por = (id: string) => lista.find((l) => l.id === id)!;
  expect(por(ok.id)).toMatchObject({ motivo: "visitante", solicitadoPor: "Recepção", situacao: "executada", catraca: "Hist liberar" });
  expect(por(pendente.id).situacao).toBe("aguardando");
  expect(por(expirada.id).situacao).toBe("expirada");
});
