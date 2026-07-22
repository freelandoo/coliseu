import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { listarLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

const LIMITE = 10;

/**
 * GET — leads ainda não trabalhados, para o aviso que aparece ao entrar no
 * sistema. Só quem atende recebe: técnico não é notificado de lead.
 */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g.erro;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return NextResponse.json({ leads: [] });
  }

  const novos = (await listarLeads())
    .filter((l) => l.estagio === "novo")
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .slice(0, LIMITE)
    .map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone, conversaId: l.conversaId }));

  return NextResponse.json({ leads: novos });
}
