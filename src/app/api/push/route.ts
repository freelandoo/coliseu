import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { chavePublicaPush } from "@/lib/push/notificar";
import { removerInscricaoPushRepo, salvarInscricaoPushRepo } from "@/lib/repositories/push";

export const dynamic = "force-dynamic";

/** Push é aviso de atendimento: só quem atende (ADMIN/RECEPCAO) assina. */
async function exigirAtendente() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return g;
  if (!podePapel(g.user.role as Papel, ["ADMIN", "RECEPCAO"])) {
    return {
      user: null as null,
      erro: NextResponse.json({ erro: "sem permissão para atendimento" }, { status: 403 }),
    };
  }
  return g;
}

/** GET — chave pública VAPID para o navegador assinar a inscrição. */
export async function GET() {
  const g = await exigirAtendente();
  if (g.erro || !g.user) return g.erro;

  const chave = chavePublicaPush();
  if (!chave) {
    return NextResponse.json({ erro: "push não configurado no servidor" }, { status: 503 });
  }
  return NextResponse.json({ publicKey: chave });
}

/** POST — registra (ou renova) a inscrição deste aparelho. */
export async function POST(req: Request) {
  const g = await exigirAtendente();
  if (g.erro || !g.user) return g.erro;

  const corpo = (await req.json().catch(() => null)) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  } | null;
  const endpoint = typeof corpo?.endpoint === "string" ? corpo.endpoint : "";
  const p256dh = typeof corpo?.keys?.p256dh === "string" ? corpo.keys.p256dh : "";
  const auth = typeof corpo?.keys?.auth === "string" ? corpo.keys.auth : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ erro: "inscrição inválida" }, { status: 400 });
  }

  await salvarInscricaoPushRepo({ userId: g.user.id, endpoint, p256dh, auth });
  return NextResponse.json({ ok: true });
}

/** DELETE — cancela a inscrição deste aparelho (só a do próprio usuário). */
export async function DELETE(req: Request) {
  const g = await exigirAtendente();
  if (g.erro || !g.user) return g.erro;

  const corpo = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = typeof corpo?.endpoint === "string" ? corpo.endpoint : "";
  if (!endpoint) return NextResponse.json({ erro: "endpoint obrigatório" }, { status: 400 });

  const removida = await removerInscricaoPushRepo(g.user.id, endpoint);
  return NextResponse.json({ ok: removida });
}
