import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  assumirConversaRepo,
  dadosEnvioConversaRepo,
  listarMensagensRepo,
  registrarMensagemRepo,
} from "@/lib/repositories/whatsapp";
import { configEvolution, enviarTexto, EvolutionError } from "@/lib/whatsapp/evolution";

export const dynamic = "force-dynamic";

const LIMITE_TEXTO = 4096; // limite prático de uma mensagem de texto do WhatsApp

async function guarda() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { user: null, erro: g.erro };
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return { user: null, erro: NextResponse.json({ erro: "sem permissão" }, { status: 403 }) };
  }
  return { user: g.user, erro: null };
}

/** GET — polling da thread aberta. `?depois=<ISO>` devolve só o delta. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro) return g.erro;

  const { id } = await params;
  const bruto = new URL(req.url).searchParams.get("depois");
  const depois = bruto ? new Date(bruto) : undefined;
  const valido = depois && !Number.isNaN(depois.getTime()) ? depois : undefined;

  return NextResponse.json({ mensagens: await listarMensagensRepo(id, valido) });
}

/**
 * POST — resposta manual da recepção. Único caminho de envio da aplicação:
 * exige sessão, e portanto um clique humano.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro || !g.user) return g.erro;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { texto?: string };
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ erro: "Mensagem vazia." }, { status: 400 });
  if (texto.length > LIMITE_TEXTO) {
    return NextResponse.json({ erro: "Mensagem longa demais." }, { status: 400 });
  }

  const cfg = configEvolution();
  if (!cfg) return NextResponse.json({ erro: "WhatsApp não configurado." }, { status: 503 });

  const conversa = await dadosEnvioConversaRepo(id);
  if (!conversa) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  if (conversa.instance.status !== "CONNECTED") {
    return NextResponse.json({ erro: "WhatsApp desconectado. Conecte antes de responder." }, { status: 409 });
  }
  if (!conversa.telefone) {
    return NextResponse.json(
      { erro: "Esta conversa não expõe o número; responda pelo aparelho." },
      { status: 409 },
    );
  }

  // Quem responde primeiro assume o atendimento.
  if (!conversa.atendenteId) {
    await assumirConversaRepo(id, g.user.id).catch(() => undefined);
  }

  try {
    const waId = await enviarTexto(cfg, conversa.instance.evolutionInstance, conversa.telefone, texto);
    // Sem id do WhatsApp não há como deduplicar o eco do webhook; o prefixo
    // "local:" deixa isso explícito no banco.
    await registrarMensagemRepo({
      conversaId: id,
      waMessageId: waId ?? `local:${randomUUID()}`,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorUserId: g.user.id,
      texto,
    });
    return NextResponse.json({ mensagens: await listarMensagensRepo(id) });
  } catch (e) {
    // Guarda a bolha marcada como falha em vez de perder o texto digitado.
    await registrarMensagemRepo({
      conversaId: id,
      waMessageId: `local:${randomUUID()}`,
      direcao: "OUT",
      autor: "ATENDENTE",
      autorUserId: g.user.id,
      texto,
      erro: e instanceof Error ? e.message.slice(0, 200) : "falha no envio",
    }).catch(() => undefined);

    if (e instanceof EvolutionError) {
      return NextResponse.json({ erro: e.message }, { status: e.status });
    }
    console.error("[whatsapp] falha ao enviar", e);
    return NextResponse.json({ erro: "Falha ao enviar a mensagem." }, { status: 502 });
  }
}
