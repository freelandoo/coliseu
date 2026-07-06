import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { criarSessao } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { email, senha } = (await req.json()) as { email?: string; senha?: string };
  if (!email || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(user.passwordHash, senha))) {
    return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
  }
  await criarSessao(user.id);
  return NextResponse.json({ ok: true, role: user.role });
}
