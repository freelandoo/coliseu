import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  criarRespostaProntaRepo,
  listarRespostasProntasRepo,
  RESPOSTA_MAX_CHARS,
} from "@/lib/repositories/respostas";

export const dynamic = "force-dynamic";

/** Mesma guarda do inbox: quem atende usa as respostas prontas; técnico não. */
async function guarda() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { user: null, erro: g.erro };
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return { user: null, erro: NextResponse.json({ erro: "sem permissão" }, { status: 403 }) };
  }
  return { user: g.user, erro: null };
}

/** GET — o acervo comum, mais recente primeiro. */
export async function GET() {
  const g = await guarda();
  if (g.erro) return g.erro;

  return NextResponse.json({ respostas: await listarRespostasProntasRepo() });
}

/** POST — cadastra uma resposta no acervo comum (escrita ou colada). */
export async function POST(req: Request) {
  const g = await guarda();
  if (g.erro || !g.user) return g.erro;

  const body = (await req.json().catch(() => ({}))) as { texto?: string };
  const texto = body.texto?.trim();
  if (!texto) {
    return NextResponse.json({ erro: "escreva ou cole o texto da resposta" }, { status: 400 });
  }
  if (texto.length > RESPOSTA_MAX_CHARS) {
    return NextResponse.json(
      { erro: `resposta muito longa (máximo de ${RESPOSTA_MAX_CHARS} caracteres)` },
      { status: 400 },
    );
  }

  return NextResponse.json({ resposta: await criarRespostaProntaRepo(texto, g.user.id) });
}
