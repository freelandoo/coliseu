import { NextResponse } from "next/server";
import { exigirAdminApi, exigirSessaoApi } from "@/lib/auth/api-guard";
import { AsaasError } from "@/lib/asaas";
import {
  CobrancaInvalida,
  cancelarCobranca,
  gerarCobrancaAvulsaParaPessoa,
  listarPagamentosDaPessoa,
} from "@/lib/billing/cobrancas";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

function erroDeCobranca(e: unknown) {
  if (e instanceof CobrancaInvalida) return NextResponse.json({ erro: e.message }, { status: 400 });
  if (e instanceof AsaasError) return NextResponse.json({ erro: e.message }, { status: 502 });
  console.error("[pagamentos]", e);
  return NextResponse.json({ erro: "Falha ao falar com o Asaas" }, { status: 502 });
}

/** Histórico de cobranças do aluno + assinatura ativa (ficha). */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  return NextResponse.json(await listarPagamentosDaPessoa(id));
}

/** Cobrança avulsa (ADMIN): taxa, produto, diferença de plano. */
export async function POST(req: Request, { params }: Ctx) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  if (!(await prisma.person.findUnique({ where: { id }, select: { id: true } }))) {
    return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    valor?: number;
    vencimento?: string;
    descricao?: string;
  };
  try {
    const r = await gerarCobrancaAvulsaParaPessoa(id, {
      valor: Number(body.valor),
      vencimento: String(body.vencimento ?? ""),
      descricao: String(body.descricao ?? ""),
    });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return erroDeCobranca(e);
  }
}

/** Cancela uma cobrança pendente/vencida (ADMIN): ?asaasId=pay_... */
export async function DELETE(req: Request, { params }: Ctx) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  const asaasId = new URL(req.url).searchParams.get("asaasId") ?? "";
  // A cobrança tem de ser desta pessoa — id de outro aluno na URL não passa.
  const pg = await prisma.payment.findFirst({
    where: {
      asaasPaymentId: asaasId,
      OR: [{ personId: id }, { subscription: { customer: { personId: id } } }],
    },
    select: { id: true },
  });
  if (!pg) return NextResponse.json({ erro: "Cobrança não encontrada" }, { status: 404 });
  try {
    await cancelarCobranca(asaasId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroDeCobranca(e);
  }
}
