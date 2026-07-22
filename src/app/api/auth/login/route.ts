import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { criarSessao } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = (await req.json()) as { login?: string; email?: string; senha?: string };
  // `email` continua aceito para não quebrar cliente antigo em cache.
  const identificador = (body.login ?? body.email ?? "").trim().toLowerCase();
  const senha = body.senha;

  if (!identificador || !senha) {
    return NextResponse.json({ erro: "Informe o login e a senha" }, { status: 400 });
  }

  // Aceita nome de acesso ou e-mail: o admin cria colaborador só com login,
  // e quem já tinha conta continua entrando pelo e-mail.
  const user = await prisma.user.findFirst({
    where: { OR: [{ login: identificador }, { email: identificador }] },
  });

  if (!user || !(await verifyPassword(user.passwordHash, senha))) {
    return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
  }
  if (!user.ativo) {
    return NextResponse.json({ erro: "Acesso desativado. Fale com o administrador." }, { status: 403 });
  }

  await criarSessao(user.id);
  return NextResponse.json({ ok: true, role: user.role, senhaProvisoria: user.senhaProvisoria });
}
