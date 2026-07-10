import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { kitDisponivel, montarZipKit } from "@/lib/agent/kit";

/**
 * Download do kit do agente da recepção (ZIP) com o .env já configurado:
 * BACKEND_URL = domínio atual, AGENT_TOKEN = env do backend, DEVICE_ID = catraca.
 * Só ADMIN — o ZIP carrega o token do agente.
 */
export async function GET(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro!;

  if (!kitDisponivel()) {
    return NextResponse.json(
      { erro: "Kit não gerado neste servidor — rode `npm run make-kit` no deploy" },
      { status: 503 },
    );
  }

  const agentToken = process.env.AGENT_TOKEN ?? "";

  // Atrás de proxy (Railway etc.) o host público vem nos headers x-forwarded-*.
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const backendUrl = `${proto}://${host}`;

  // DEVICE_ID: o escolhido na tela ou, sem parâmetro, a única catraca cadastrada.
  const deviceIdParam = new URL(req.url).searchParams.get("deviceId");
  let deviceId = deviceIdParam ?? "";
  if (!deviceId) {
    const devices = await prisma.accessDevice.findMany({ select: { id: true }, take: 2 });
    if (devices.length === 1) deviceId = devices[0].id;
  } else {
    const existe = await prisma.accessDevice.findUnique({ where: { id: deviceId }, select: { id: true } });
    if (!existe) return NextResponse.json({ erro: "AccessDevice não encontrado" }, { status: 404 });
  }

  const zip = await montarZipKit({ backendUrl, agentToken, deviceId });

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="coliseu-agent-kit.zip"',
      "Cache-Control": "no-store",
    },
  });
}
