import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sessaoAtualId } from "@/lib/auth/session";

export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro!;

  const { senhaAtual, novaSenha } = (await req.json()) as {
    senhaAtual?: string;
    novaSenha?: string;
  };
  if (!novaSenha) {
    return NextResponse.json({ erro: "Informe a nova senha" }, { status: 400 });
  }
  if (novaSenha.length < 8) {
    return NextResponse.json({ erro: "A nova senha deve ter ao menos 8 caracteres" }, { status: 400 });
  }

  // Troca obrigatória do primeiro acesso: a senha provisória acabou de ser usada
  // para abrir esta sessão, então exigi-la de novo só atrapalharia. Nos demais
  // casos a senha atual é obrigatória — sessão sequestrada não troca senha.
  if (!g.user.senhaProvisoria) {
    if (!senhaAtual) {
      return NextResponse.json({ erro: "Informe a senha atual" }, { status: 400 });
    }
    if (!(await verifyPassword(g.user.passwordHash, senhaAtual))) {
      return NextResponse.json({ erro: "Senha atual incorreta" }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id: g.user.id },
    data: { passwordHash: await hashPassword(novaSenha), senhaProvisoria: false },
  });

  // Troca de senha derruba as outras sessões — só a atual continua válida.
  const atual = await sessaoAtualId();
  await prisma.session.deleteMany({
    where: { userId: g.user.id, ...(atual ? { id: { not: atual } } : {}) },
  });

  return NextResponse.json({ ok: true });
}
