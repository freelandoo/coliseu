import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { ackComando } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as {
    commandId?: string; status?: "SUCCEEDED" | "FAILED"; error?: string;
    /** ENROLL: `{ userImage }` com a foto capturada (agente ≥ 0.5.0). */
    result?: { userImage?: unknown };
  };
  if (!body.commandId || (body.status !== "SUCCEEDED" && body.status !== "FAILED")) {
    return NextResponse.json({ erro: "commandId e status (SUCCEEDED|FAILED) obrigatórios" }, { status: 400 });
  }
  const userImage = typeof body.result?.userImage === "string" ? body.result.userImage : undefined;
  await ackComando({ commandId: body.commandId, status: body.status, error: body.error, userImage });
  return NextResponse.json({ ok: true });
}
