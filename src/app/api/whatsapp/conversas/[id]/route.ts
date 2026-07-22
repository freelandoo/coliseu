import { NextResponse } from "next/server";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import {
  classificarConversaRepo,
  listarAtendimentosRepo,
  listarMensagensRepo,
  marcarConversaLidaRepo,
  obterConversaRepo,
  removerConversaRepo,
} from "@/lib/repositories/whatsapp";
import { INTERESSE_LABEL, type ConversaInteresse } from "@/lib/types";

export const dynamic = "force-dynamic";

async function guarda() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { user: null, erro: g.erro };
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return { user: null, erro: NextResponse.json({ erro: "sem permissão" }, { status: 403 }) };
  }
  return { user: g.user, erro: null };
}

/** GET — conversa + histórico. Abrir a conversa zera o contador de não lidas. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro) return g.erro;

  const { id } = await ctx.params;
  const conversa = await obterConversaRepo(id);
  if (!conversa) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });

  const [mensagens, atendimentos] = await Promise.all([
    listarMensagensRepo(id),
    listarAtendimentosRepo(id),
  ]);
  await marcarConversaLidaRepo(id).catch(() => undefined);

  return NextResponse.json({ conversa: { ...conversa, naoLidas: 0 }, mensagens, atendimentos });
}

/**
 * DELETE — remove a conversa e todo o histórico dela. Só ADMIN: apaga registro
 * de atendimento, que é trilha de auditoria. O lead continua no funil.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;

  const { id } = await ctx.params;
  const removida = await removerConversaRepo(id);
  if (!removida) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

/** PATCH — classifica o atendimento e move o lead no funil. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guarda();
  if (g.erro || !g.user) return g.erro;

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    interesse?: string;
    observacao?: string;
    motivoPerdido?: string;
  };

  const interesse = body.interesse as ConversaInteresse | undefined;
  if (!interesse || !(interesse in INTERESSE_LABEL)) {
    return NextResponse.json({ erro: "classificação inválida" }, { status: 400 });
  }

  const conversa = await classificarConversaRepo({
    conversaId: id,
    userId: g.user.id,
    interesse,
    observacao: body.observacao,
    motivoPerdido: body.motivoPerdido,
  });
  if (!conversa) return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });

  return NextResponse.json({ conversa, atendimentos: await listarAtendimentosRepo(id) });
}
