import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  assumirConversaRepo,
  dadosEnvioConversaRepo,
  limparMensagensRepo,
  listarMensagensRepo,
  registrarMensagemRepo,
} from "@/lib/repositories/whatsapp";
import { configEvolution, enviarMidia, enviarTexto, EvolutionError } from "@/lib/whatsapp/evolution";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";

export const dynamic = "force-dynamic";

const LIMITE_TEXTO = 4096; // limite prático de uma mensagem de texto do WhatsApp
const LIMITE_MIDIA = 16 * 1024 * 1024; // 16 MB — teto prático de anexo do WhatsApp

/** Só imagem e PDF: o que a recepção precisa mandar, e o que a bolha sabe exibir. */
function classificarUpload(
  mime: string,
): { mediatype: "image" | "document"; tipoMidia: "imagem" | "documento" } | null {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return { mediatype: "image", tipoMidia: "imagem" };
  if (m === "application/pdf") return { mediatype: "document", tipoMidia: "documento" };
  return null;
}

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
 * DELETE — limpa o histórico de mensagens, mantendo a conversa, o vínculo com o
 * lead e os registros de atendimento. Só ADMIN.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;

  const { id } = await params;
  const apagadas = await limparMensagensRepo(id);
  return NextResponse.json({ ok: true, apagadas });
}

/**
 * POST — resposta manual da recepção. Único caminho de envio da aplicação:
 * exige sessão, e portanto um clique humano.
 *
 * Aceita texto (JSON `{ texto }`) ou anexo (`multipart/form-data` com o campo
 * `arquivo` e um `texto` opcional de legenda) — imagem ou PDF.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro || !g.user) return g.erro;

  const { id } = await params;

  const cfg = configEvolution();
  if (!cfg) return NextResponse.json({ erro: "WhatsApp não configurado." }, { status: 503 });

  const conversa = await dadosEnvioConversaRepo(id);
  if (!conversa) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  if (conversa.instance.status !== "CONNECTED") {
    return NextResponse.json({ erro: "WhatsApp desconectado. Conecte antes de responder." }, { status: 409 });
  }
  // Grupo se endereça pelo JID; pessoa, pelo telefone.
  const destino = conversa.ehGrupo ? conversa.remoteJid : conversa.telefone;
  if (!destino) {
    return NextResponse.json(
      { erro: "Esta conversa não expõe o número; responda pelo aparelho." },
      { status: 409 },
    );
  }

  const instancia = conversa.instance.evolutionInstance;
  const ehMidia = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

  // Quem responde primeiro assume o atendimento — vale para texto e anexo.
  async function assumir() {
    if (!conversa!.atendenteId) await assumirConversaRepo(id, g.user!.id).catch(() => undefined);
  }

  if (ehMidia) {
    const form = await req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return NextResponse.json({ erro: "Nenhum arquivo recebido." }, { status: 400 });
    }
    const info = classificarUpload(arquivo.type);
    if (!info) {
      return NextResponse.json({ erro: "Tipo não suportado. Envie imagem ou PDF." }, { status: 415 });
    }
    if (arquivo.size > LIMITE_MIDIA) {
      return NextResponse.json({ erro: "Arquivo grande demais (máx. 16 MB)." }, { status: 413 });
    }

    const legenda = String(form?.get("texto") ?? "").trim().slice(0, LIMITE_TEXTO);
    const rotulo = legenda || ROTULO_MIDIA[info.tipoMidia];
    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
    const fileName = arquivo.name || (info.mediatype === "image" ? "imagem" : "arquivo");

    await assumir();
    try {
      const waId = await enviarMidia(cfg, instancia, destino, {
        mediatype: info.mediatype,
        mimetype: arquivo.type,
        base64,
        fileName,
        caption: legenda || undefined,
      });
      await registrarMensagemRepo({
        conversaId: id,
        waMessageId: waId ?? `local:${randomUUID()}`,
        direcao: "OUT",
        autor: "ATENDENTE",
        autorUserId: g.user.id,
        texto: rotulo,
        tipoMidia: info.tipoMidia,
      });
      return NextResponse.json({ mensagens: await listarMensagensRepo(id) });
    } catch (e) {
      await registrarMensagemRepo({
        conversaId: id,
        waMessageId: `local:${randomUUID()}`,
        direcao: "OUT",
        autor: "ATENDENTE",
        autorUserId: g.user.id,
        texto: rotulo,
        tipoMidia: info.tipoMidia,
        erro: e instanceof Error ? e.message.slice(0, 200) : "falha no envio",
      }).catch(() => undefined);

      if (e instanceof EvolutionError) return NextResponse.json({ erro: e.message }, { status: e.status });
      console.error("[whatsapp] falha ao enviar anexo", e);
      return NextResponse.json({ erro: "Falha ao enviar o anexo." }, { status: 502 });
    }
  }

  const body = (await req.json().catch(() => ({}))) as { texto?: string };
  const texto = String(body.texto ?? "").trim();
  if (!texto) return NextResponse.json({ erro: "Mensagem vazia." }, { status: 400 });
  if (texto.length > LIMITE_TEXTO) {
    return NextResponse.json({ erro: "Mensagem longa demais." }, { status: 400 });
  }

  await assumir();
  try {
    const waId = await enviarTexto(cfg, instancia, destino, texto);
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
