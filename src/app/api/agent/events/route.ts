import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { ingestarEvento } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as Parameters<typeof ingestarEvento>[0];
  if (!body?.deviceId || !body?.deviceEventId) {
    return NextResponse.json({ erro: "deviceId e deviceEventId obrigatórios" }, { status: 400 });
  }
  const r = await ingestarEvento(body);
  return NextResponse.json(r);
}
