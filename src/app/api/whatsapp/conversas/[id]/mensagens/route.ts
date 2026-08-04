import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  limparMensagensRepo,
  listarMensagensRepo,
  registrarMensagemRepo,
} from "@/lib/repositories/whatsapp";
import { enviarMidia, EvolutionError } from "@/lib/whatsapp/evolution";
import {
  contextoEnvio,
  ehFalhaEnvio,
  enviarTextoNaConversa,
  LIMITE_TEXTO,
} from "@/lib/whatsapp/responder";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";

export const dynamic = "force-dynamic";

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
 * lead e os registros de atendimento. Só ADMIN. O histórico vai para a lixeira
 * antes de ser apagado.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdminApi();
  if (g.erro || !g.user) return g.erro;

  const { id } = await params;
  const apagadas = await limparMensagensRepo(id, { id: g.user.id, nome: g.user.nome });
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

  // Config, conexão e destino — vale para texto e anexo.
  const ctx = await contextoEnvio(id, g.user.id);
  if (ehFalhaEnvio(ctx)) return NextResponse.json({ erro: ctx.erro }, { status: ctx.status });

  const ehMidia = (req.headers.get("content-type") ?? "").includes("multipart/form-data");

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

    await ctx.assumir();
    try {
      const waId = await enviarMidia(ctx.cfg, ctx.instancia, ctx.destino, {
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

  // A bolha com o erro já fica guardada lá dentro — o texto digitado não se
  // perde quando o envio falha.
  const falha = await enviarTextoNaConversa({
    conversaId: id,
    texto,
    userId: g.user.id,
    contexto: ctx,
  });
  if (falha) return NextResponse.json({ erro: falha.erro }, { status: falha.status });

  return NextResponse.json({ mensagens: await listarMensagensRepo(id) });
}
