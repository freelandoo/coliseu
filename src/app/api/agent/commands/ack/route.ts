import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { ackComando } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as { commandId?: string; status?: "SUCCEEDED" | "FAILED"; error?: string };
  if (!body.commandId || (body.status !== "SUCCEEDED" && body.status !== "FAILED")) {
    return NextResponse.json({ erro: "commandId e status (SUCCEEDED|FAILED) obrigatórios" }, { status: 400 });
  }
  await ackComando({ commandId: body.commandId, status: body.status, error: body.error });
  return NextResponse.json({ ok: true });
}
