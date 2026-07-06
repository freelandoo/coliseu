import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { entregarComandos } from "@/lib/agent/ingest";

export async function GET(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const deviceId = new URL(req.url).searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ erro: "deviceId obrigatório" }, { status: 400 });
  const cmds = await entregarComandos(deviceId);
  return NextResponse.json(cmds.map((c) => ({ id: c.id, type: c.type, payload: c.payload })));
}
