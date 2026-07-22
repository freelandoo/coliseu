import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { atualizarStatusInstanciaRepo, instanciaAtualRepo } from "@/lib/repositories/whatsapp";
import { conectar, configEvolution, EvolutionError } from "@/lib/whatsapp/evolution";

export const dynamic = "force-dynamic";

/**
 * GET — QR Code para parear o aparelho. O modal chama repetidamente: o QR do
 * WhatsApp expira em ~20s, então cada chamada pede um novo à Evolution.
 */
export async function GET() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;

  const cfg = configEvolution();
  if (!cfg) {
    return NextResponse.json({ erro: "WhatsApp não configurado." }, { status: 503 });
  }

  const instancia = await instanciaAtualRepo();
  if (!instancia) {
    return NextResponse.json({ erro: "Instância ainda não criada." }, { status: 409 });
  }

  try {
    const r = await conectar(cfg, instancia.evolutionInstance);
    await atualizarStatusInstanciaRepo(
      instancia.evolutionInstance,
      r.conectado ? "CONNECTED" : "CONNECTING",
    );
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof EvolutionError) {
      return NextResponse.json({ erro: e.message }, { status: e.status });
    }
    console.error("[whatsapp] erro ao gerar QR", e);
    return NextResponse.json({ erro: "Falha ao gerar o QR Code." }, { status: 502 });
  }
}
