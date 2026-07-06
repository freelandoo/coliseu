import { NextResponse } from "next/server";

/** Valida o token do agente (header x-agent-token). Em produção exige AGENT_TOKEN. */
export function exigirAgente(req: Request): NextResponse | null {
  const expected = process.env.AGENT_TOKEN;
  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json({ error: "agent token not configured" }, { status: 503 });
  }
  if (expected && req.headers.get("x-agent-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // ok
}
