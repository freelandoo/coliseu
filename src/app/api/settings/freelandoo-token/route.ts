import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { gerarTokenFreelandoo, statusTokenFreelandoo } from "@/lib/freelandoo/token";

export async function GET() {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;
  return NextResponse.json(await statusTokenFreelandoo());
}

export async function POST() {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;
  const token = await gerarTokenFreelandoo(g.user.id);
  return NextResponse.json({ token });
}
