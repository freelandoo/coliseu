import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  removerRespostaProntaRepo,
  renomearRespostaProntaRepo,
  TITULO_MAX_CHARS,
} from "@/lib/repositories/respostas";

export const dynamic = "force-dynamic";

/** Mesma guarda do acervo: quem atende mexe nas respostas; técnico não. */
async function guarda() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { user: null, erro: g.erro };
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return { user: null, erro: NextResponse.json({ erro: "sem permissão" }, { status: 403 }) };
  }
  return { user: g.user, erro: null };
}

/**
 * PATCH — troca só o título (a identificação na lista); a mensagem original
 * não muda por aqui. Título vazio volta a mostrar a primeira frase.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro) return g.erro;

  const body = (await req.json().catch(() => ({}))) as { titulo?: unknown };
  if (typeof body.titulo !== "string") {
    return NextResponse.json({ erro: "título inválido" }, { status: 400 });
  }
  const titulo = body.titulo.trim();
  if (titulo.length > TITULO_MAX_CHARS) {
    return NextResponse.json(
      { erro: `título muito longo (máximo de ${TITULO_MAX_CHARS} caracteres)` },
      { status: 400 },
    );
  }

  const { id } = await ctx.params;
  const resposta = await renomearRespostaProntaRepo(id, titulo || null);
  if (!resposta) return NextResponse.json({ erro: "resposta não encontrada" }, { status: 404 });

  return NextResponse.json({ resposta });
}

/**
 * DELETE — tira a resposta do acervo comum. Aberto a quem atende (não só
 * ADMIN): não é trilha de auditoria, é texto de trabalho — quem colou errado
 * corrige na hora.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro) return g.erro;

  const { id } = await ctx.params;
  const removida = await removerRespostaProntaRepo(id);
  if (!removida) return NextResponse.json({ erro: "resposta não encontrada" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
