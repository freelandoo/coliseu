import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { barramentoRecepcao, type AvisoRecepcao } from "@/lib/access/avisos-recepcao";

/**
 * POST — simula "alguém não reconhecido tentou entrar" para conferir a ficha
 * automática sem ninguém na frente do leitor. Só ADMIN. Publica direto no
 * barramento (sem a janela anti-repetição, para dar para testar seguido).
 * O "Capturar foto" da ficha aberta assim aciona o leitor de verdade.
 */
export async function POST(req: Request) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
  if (!body.deviceId) return NextResponse.json({ erro: "deviceId obrigatório" }, { status: 400 });
  const aviso: AvisoRecepcao = { tipo: "nao-identificado", deviceId: body.deviceId, quando: new Date().toISOString() };
  barramentoRecepcao.emit("aviso", aviso);
  return NextResponse.json({ ok: true });
}
