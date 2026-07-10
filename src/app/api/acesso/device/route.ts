import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirAdminApi } from "@/lib/auth/api-guard";

/** Cadastra uma catraca (AccessDevice) — necessário em produção, onde não há seed. */
export async function POST(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;

  const { name } = (await req.json()) as { name?: string };
  const nome = name?.trim();
  if (!nome) {
    return NextResponse.json({ erro: "Informe o nome da catraca" }, { status: 400 });
  }

  const device = await prisma.accessDevice.create({
    data: { unitId: g.user.unitId, name: nome, mode: "HYBRID", status: "OFFLINE" },
  });
  return NextResponse.json({ id: device.id, name: device.name });
}
