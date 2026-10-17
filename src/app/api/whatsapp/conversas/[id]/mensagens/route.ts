import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  citacaoPorIdRepo,
  deltaLegadoRepo,
  limparMensagensRepo,
  mensagemPorWaIdRepo,
  paginaMensagensRepo,
  registrarMensagemRepo,
} from "@/lib/repositories/whatsapp";
import { lerCursor, lerLimite, PAGINA_MENSAGENS, TETO_PAGINA_MENSAGENS } from "@/lib/whatsapp/historico";
import { enviarAudio, enviarMidia, EvolutionError } from "@/lib/whatsapp/evolution";
import {
  contextoEnvio,
  ehFalhaEnvio,
  enviarTextoNaConversa,
  LIMITE_TEXTO,
} from "@/lib/whatsapp/responder";
import { assinar } from "@/lib/whatsapp/assinatura";
import { ROTULO_MIDIA } from "@/lib/whatsapp/payload";

export const dynamic = "force-dynamic";

const LIMITE_MIDIA = 16 * 1024 * 1024; // 16 MB — teto prático de anexo do WhatsApp

/**
 * Imagem, PDF e áudio: o que a recepção precisa mandar, e o que a bolha sabe
 * exibir. Áudio sai por outro endpoint da Evolution (mensagem de voz, não
 * arquivo anexado), por isso é uma categoria à parte e não um `mediatype`.
 */
type Upload =
  | { voz: false; mediatype: "image" | "document"; tipoMidia: "imagem" | "documento" }
  | { voz: true; tipoMidia: "audio" };

function classificarUpload(mime: string): Upload | null {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return { voz: false, mediatype: "image", tipoMidia: "imagem" };
  if (m === "application/pdf") return { voz: false, mediatype: "document", tipoMidia: "documento" };
  // O gravador manda webm/opus, ogg/opus ou mp4/aac, conforme o navegador; o
  // `;codecs=…` vem junto no mime, então compara-se o prefixo.
  if (m.startsWith("audio/")) return { voz: true, tipoMidia: "audio" };
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

/**
 * GET — leitura do histórico em páginas, sempre em ordem cronológica.
 *
 * - `?antes=<cursor>`: a página anterior ao cursor (rolar para cima).
 * - `?apos=<cursor>`: as novidades depois do cursor; `temMais` diz se ainda há.
 * - `?depois=<ISO>`: delta legado, mantido para quem ainda o usa — `gte`, em
 *   ordem crescente, até 500; `temMais` avisa quando o teto cortou o delta.
 * - sem nada: as mais recentes.
 *
 * `limite` opcional, até 200. Cursor inválido é 400 — cair silenciosamente na
 * página mais recente faria a tela "carregar anteriores" e receber o fim.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro) return g.erro;

  const { id } = await params;
  const busca = new URL(req.url).searchParams;

  if (busca.has("depois") && !busca.has("antes") && !busca.has("apos")) {
    const depois = new Date(busca.get("depois") ?? "");
    // Como antes: `depois` inválido é ignorado e a resposta é a conversa.
    if (Number.isNaN(depois.getTime())) {
      return NextResponse.json({ mensagens: (await paginaMensagensRepo(id, { limite: 500 })).mensagens });
    }
    return NextResponse.json(await deltaLegadoRepo(id, depois));
  }

  const antes = busca.has("antes") ? lerCursor(busca.get("antes")) : null;
  const apos = busca.has("apos") ? lerCursor(busca.get("apos")) : null;
  if ((busca.has("antes") && !antes) || (busca.has("apos") && !apos) || (antes && apos)) {
    return NextResponse.json({ erro: "cursor inválido" }, { status: 400 });
  }
  const limite = lerLimite(busca.get("limite"), PAGINA_MENSAGENS, TETO_PAGINA_MENSAGENS);
  return NextResponse.json(await paginaMensagensRepo(id, { antes, apos, limite }));
}

/**
 * O que um envio devolve: a mensagem gravada (para a tela trocar só a bolha
 * dela) e o fim da conversa (para a tela juntar ao que já tem — nunca para
 * substituir o histórico carregado).
 */
async function respostaDoEnvio(conversaId: string, waMessageId: string) {
  const [mensagem, pagina] = await Promise.all([
    mensagemPorWaIdRepo(conversaId, waMessageId),
    paginaMensagensRepo(conversaId),
  ]);
  return { mensagem, mensagens: pagina.mensagens, temAnteriores: pagina.temAnteriores };
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

/** Erro de citação que a recepção entende — a original sumiu, ou nunca foi ao WhatsApp. */
const ERRO_CITACAO = "A mensagem citada não está mais disponível. Envie sem citar.";

/**
 * POST — resposta manual da recepção. Único caminho de envio da aplicação:
 * exige sessão, e portanto um clique humano.
 *
 * Aceita texto (JSON `{ texto, citarId? }`) ou anexo (`multipart/form-data` com
 * o campo `arquivo`, um `texto` opcional de legenda e um `citarId` opcional) —
 * imagem ou PDF.
 *
 * A assinatura de quem atende é colada aqui, e não na caixa de texto: ninguém
 * apaga a própria assinatura, e o que sai é sempre o que a recepção escreveu
 * mais o nome dela na frente (ver `@/lib/whatsapp/assinatura`).
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
      return NextResponse.json(
        { erro: "Tipo não suportado. Envie imagem, PDF ou áudio." },
        { status: 415 },
      );
    }
    if (arquivo.size > LIMITE_MIDIA) {
      return NextResponse.json({ erro: "Arquivo grande demais (máx. 16 MB)." }, { status: 413 });
    }

    // Mensagem de voz não leva legenda: o WhatsApp não a mostra, e o que fosse
    // digitado sumiria sem aviso. O texto na caixa fica lá, para ser enviado à
    // parte.
    const legenda = info.voz
      ? ""
      : assinar(String(form?.get("texto") ?? ""), g.user.login).slice(0, LIMITE_TEXTO);
    const rotulo = legenda || ROTULO_MIDIA[info.tipoMidia];
    const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");

    const citarId = String(form?.get("citarId") ?? "").trim();
    const citada = citarId ? await citacaoPorIdRepo(id, citarId) : null;
    if (citarId && !citada) return NextResponse.json({ erro: ERRO_CITACAO }, { status: 409 });

    await ctx.assumir();
    try {
      const quoted = citada && { waId: citada.waId, texto: citada.texto };
      const waId = info.voz
        ? await enviarAudio(ctx.cfg, ctx.instancia, ctx.destino, base64, quoted)
        : await enviarMidia(
            ctx.cfg,
            ctx.instancia,
            ctx.destino,
            {
              mediatype: info.mediatype,
              mimetype: arquivo.type,
              base64,
              fileName: arquivo.name || (info.mediatype === "image" ? "imagem" : "arquivo"),
              caption: legenda || undefined,
            },
            quoted,
          );
      const waMessageId = waId ?? `local:${randomUUID()}`;
      await registrarMensagemRepo({
        conversaId: id,
        waMessageId,
        direcao: "OUT",
        autor: "ATENDENTE",
        autorUserId: g.user.id,
        texto: rotulo,
        tipoMidia: info.tipoMidia,
        citada,
      });
      return NextResponse.json(await respostaDoEnvio(id, waMessageId));
    } catch (e) {
      await registrarMensagemRepo({
        conversaId: id,
        waMessageId: `local:${randomUUID()}`,
        direcao: "OUT",
        autor: "ATENDENTE",
        autorUserId: g.user.id,
        texto: rotulo,
        tipoMidia: info.tipoMidia,
        citada,
        erro: e instanceof Error ? e.message.slice(0, 200) : "falha no envio",
      }).catch(() => undefined);

      if (e instanceof EvolutionError) return NextResponse.json({ erro: e.message }, { status: e.status });
      console.error("[whatsapp] falha ao enviar anexo", e);
      return NextResponse.json(
        { erro: info.voz ? "Falha ao enviar o áudio." : "Falha ao enviar o anexo." },
        { status: 502 },
      );
    }
  }

  const body = (await req.json().catch(() => ({}))) as { texto?: string; citarId?: string };
  if (!String(body.texto ?? "").trim()) {
    return NextResponse.json({ erro: "Mensagem vazia." }, { status: 400 });
  }
  const texto = assinar(String(body.texto), g.user.login);
  if (texto.length > LIMITE_TEXTO) {
    return NextResponse.json({ erro: "Mensagem longa demais." }, { status: 400 });
  }

  const citarId = String(body.citarId ?? "").trim();
  const citada = citarId ? await citacaoPorIdRepo(id, citarId) : null;
  if (citarId && !citada) return NextResponse.json({ erro: ERRO_CITACAO }, { status: 409 });

  // A bolha com o erro já fica guardada lá dentro — o texto digitado não se
  // perde quando o envio falha.
  const envio = await enviarTextoNaConversa({
    conversaId: id,
    texto,
    userId: g.user.id,
    contexto: ctx,
    citada,
  });
  if (ehFalhaEnvio(envio)) {
    // A bolha de erro gravada vai junto: a tela a põe no lugar da otimista.
    const mensagem = envio.waMessageId ? await mensagemPorWaIdRepo(id, envio.waMessageId) : null;
    return NextResponse.json({ erro: envio.erro, mensagem }, { status: envio.status });
  }

  return NextResponse.json(await respostaDoEnvio(id, envio.waMessageId));
}
