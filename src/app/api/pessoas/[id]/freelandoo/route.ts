import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { registrarAudit } from "@/lib/access/audit";
import { contaFreelandooDaPessoa, executarAcaoFicha, type AcaoFicha } from "@/lib/freelandoo/conta";
import { sincronizarPessoaFreelandoo } from "@/lib/freelandoo/sincronizar";
import { freelandooConfigurado } from "@/lib/freelandoo/cliente";

type Ctx = { params: Promise<{ id: string }> };

/** Balcão (recepção) e admin; o técnico só cuida da catraca. */
async function guard() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) return { erro: g.erro!, user: null };
  if (!podePapel(g.user.role as Papel, ["RECEPCAO", "ADMIN"])) {
    return { erro: NextResponse.json({ erro: "sem permissão" }, { status: 403 }), user: null };
  }
  return { erro: null, user: g.user };
}

/** Situação da conta. Com vínculo, puxa a cópia fresca da Freelandoo (Q13). */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await guard();
  if (g.erro) return g.erro;
  const { id } = await params;
  if (freelandooConfigurado()) {
    try {
      await sincronizarPessoaFreelandoo(id);
    } catch (e) {
      console.error("[freelandoo] sync da ficha falhou:", e); // mostra a cópia que já tinha
    }
  }
  const conta = await contaFreelandooDaPessoa(id);
  if (!conta) return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  return NextResponse.json(conta);
}

const ACOES: AcaoFicha[] = ["criar", "reenviar", "tentar_de_novo"];

/** Botões da ficha: Criar acesso / Reenviar acesso / Tentar de novo. Só enfileiram. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await guard();
  if (g.erro) return g.erro;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { acao?: string };
  const acao = body.acao as AcaoFicha;
  if (!ACOES.includes(acao)) {
    return NextResponse.json({ erro: "acao deve ser criar, reenviar ou tentar_de_novo" }, { status: 400 });
  }
  const r = await executarAcaoFicha(id, acao);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });
  await registrarAudit({
    actorType: "USER", actorId: g.user!.id, action: `FREELANDOO_${acao.toUpperCase()}`,
    entity: "Person", entityId: id,
  });
  const conta = await contaFreelandooDaPessoa(id);
  return NextResponse.json({ ok: true, mensagem: r.mensagem, conta });
}
