import { NextResponse } from "next/server";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";
import {
  atualizarStatusInstanciaRepo,
  instanciaAtualRepo,
  registrarInstanciaRepo,
} from "@/lib/repositories/whatsapp";
import {
  configEvolution,
  criarInstancia,
  desconectar,
  estadoConexao,
  EvolutionError,
} from "@/lib/whatsapp/evolution";
import { formatarTelefone } from "@/lib/whatsapp/telefone";

export const dynamic = "force-dynamic";

function semConfig() {
  return NextResponse.json(
    { erro: "WhatsApp não configurado. Defina EVOLUTION_URL e EVOLUTION_API_KEY." },
    { status: 503 },
  );
}

function tratarErro(e: unknown) {
  if (e instanceof EvolutionError) return NextResponse.json({ erro: e.message }, { status: e.status });
  console.error("[whatsapp] erro na instância", e);
  return NextResponse.json({ erro: "Falha ao falar com a Evolution." }, { status: 502 });
}

/** GET — status atual, para o cabeçalho da Captação e o polling do modal. */
export async function GET() {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;

  const cfg = configEvolution();
  const instancia = await instanciaAtualRepo();
  if (!instancia) {
    return NextResponse.json({ configurado: !!cfg, existe: false, status: "DISCONNECTED" });
  }

  // A fonte da verdade é a Evolution; o banco é cache. `null` = indisponível,
  // e aí preservamos o último status conhecido em vez de piscar "desconectado".
  let status = instancia.status;
  if (cfg) {
    const aberto = await estadoConexao(cfg, instancia.evolutionInstance);
    if (aberto !== null) {
      status = aberto ? "CONNECTED" : instancia.status === "CONNECTING" ? "CONNECTING" : "DISCONNECTED";
      if (status !== instancia.status) {
        await atualizarStatusInstanciaRepo(instancia.evolutionInstance, status);
      }
    }
  }

  return NextResponse.json({
    configurado: !!cfg,
    existe: true,
    status,
    instancia: instancia.evolutionInstance,
    numero: formatarTelefone(instancia.numeroConectado),
  });
}

/** POST — cria (ou reaproveita) a instância e deixa pronta para o QR. ADMIN. */
export async function POST() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;

  const cfg = configEvolution();
  if (!cfg) return semConfig();

  try {
    await criarInstancia(cfg, cfg.instancia);
    const instancia = await registrarInstanciaRepo(cfg.instancia, "WhatsApp da academia");
    return NextResponse.json({ ok: true, instancia: instancia.evolutionInstance });
  } catch (e) {
    return tratarErro(e);
  }
}

/** DELETE — desconecta o aparelho (mantém histórico e conversas). ADMIN. */
export async function DELETE() {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;

  const cfg = configEvolution();
  if (!cfg) return semConfig();

  const instancia = await instanciaAtualRepo();
  if (!instancia) return NextResponse.json({ ok: true });

  try {
    await desconectar(cfg, instancia.evolutionInstance);
    await atualizarStatusInstanciaRepo(instancia.evolutionInstance, "DISCONNECTED", null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return tratarErro(e);
  }
}
