import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { gerarTokenFreelandoo, statusTokenFreelandoo } from "@/lib/freelandoo/token";

async function exigirAdmin() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) {
    return { user: null as null, erro: g.erro ?? NextResponse.json({ erro: "não autenticado" }, { status: 401 }) };
  }
  if (!podePapel(g.user.role as Papel, ["ADMIN"])) {
    return { user: null as null, erro: NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 }) };
  }
  return { user: g.user, erro: null as null };
}

export async function GET() {
  const g = await exigirAdmin();
  if (g.erro || !g.user) return g.erro!;
  return NextResponse.json(await statusTokenFreelandoo());
}

export async function POST() {
  const g = await exigirAdmin();
  if (g.erro || !g.user) return g.erro!;
  const token = await gerarTokenFreelandoo(g.user.id);
  return NextResponse.json({ token });
}
