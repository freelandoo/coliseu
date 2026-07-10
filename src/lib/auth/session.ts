import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "coliseu_session";
const DIAS = 7;

export async function criarSessao(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + DIAS * 86_400_000);
  const s = await prisma.session.create({ data: { userId, expiresAt } });
  (await cookies()).set(COOKIE, s.id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
}

/** Id da sessão atual (cookie) — útil para preservá-la ao revogar as demais. */
export async function sessaoAtualId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export async function usuarioAtual() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const s = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

export async function destruirSessao(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await prisma.session.delete({ where: { id } }).catch(() => {});
  jar.delete(COOKIE);
}
