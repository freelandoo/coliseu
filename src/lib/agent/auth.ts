import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** Comparação em tempo constante — !== vazaria por timing o prefixo certo do token. */
function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Valida o token do agente (header x-agent-token). Em produção exige AGENT_TOKEN. */
export function exigirAgente(req: Request): NextResponse | null {
  const expected = process.env.AGENT_TOKEN;
  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json({ error: "agent token not configured" }, { status: 503 });
  }
  if (expected && !tokenConfere(req.headers.get("x-agent-token") ?? "", expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // ok
}
