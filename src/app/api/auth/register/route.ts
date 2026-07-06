import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { criarSessao } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { nome, email, senha } = (await req.json()) as { nome?: string; email?: string; senha?: string };
  const emailNorm = email?.trim().toLowerCase();
  if (!nome?.trim() || !emailNorm || !senha) {
    return NextResponse.json({ erro: "Informe nome, e-mail e senha" }, { status: 400 });
  }
  if (senha.length < 8) {
    return NextResponse.json({ erro: "A senha deve ter ao menos 8 caracteres" }, { status: 400 });
  }

  // Vincula à unidade existente (cria a matriz se o banco ainda não tem nenhuma).
  const unit =
    (await prisma.unit.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await prisma.unit.create({ data: { slug: "matriz", nome: "Matriz" } }));

  try {
    const user = await prisma.user.create({
      data: {
        nome: nome.trim(),
        email: emailNorm,
        passwordHash: await hashPassword(senha),
        role: "ADMIN", // app interno local: o cadastro cria um administrador
        unitId: unit.id,
      },
    });
    await criarSessao(user.id);
    return NextResponse.json({ ok: true, role: user.role });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ erro: "Já existe uma conta com este e-mail" }, { status: 409 });
    }
    throw e;
  }
}
