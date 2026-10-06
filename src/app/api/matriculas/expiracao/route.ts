import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import {
  CARENCIA_DIAS,
  candidatosExpiracao,
  expirarMatriculasVencidas,
  modoExpiracao,
} from "@/lib/billing/expiracao";

/** Prévia: quem venceria agora e em que modo o agendador está. */
export async function GET() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const candidatos = await candidatosExpiracao();
  return NextResponse.json({ modo: modoExpiracao(), carenciaDias: CARENCIA_DIAS, candidatos });
}

/** Vence agora (ADMIN), mesmo com o agendador em simulação. */
export async function POST() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  return NextResponse.json(await expirarMatriculasVencidas({ forcar: true }));
}
