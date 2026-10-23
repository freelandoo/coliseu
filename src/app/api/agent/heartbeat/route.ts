import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { registrarHeartbeat } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as { deviceId?: string; firmware?: string; connectivity?: string; clockDriftMs?: number; precisaCursor?: boolean };
  if (!body.deviceId) return NextResponse.json({ erro: "deviceId obrigatório" }, { status: 400 });
  const r = await registrarHeartbeat({
    deviceId: body.deviceId, firmware: body.firmware, connectivity: body.connectivity,
    clockDriftMs: body.clockDriftMs, precisaCursor: body.precisaCursor === true,
  });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 404 });
  return NextResponse.json({ ok: true, cursor: r.cursor ?? null });
}
