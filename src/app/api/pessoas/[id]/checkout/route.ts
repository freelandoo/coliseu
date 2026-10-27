import { NextResponse } from "next/server";
import { exigirModuloApi } from "@/lib/auth/api-guard";
import { AsaasError } from "@/lib/asaas";
import {
  METODOS_BALCAO,
  VendaBalcaoInvalida,
  confirmarVendaBalcao,
  vendaDeBalcao,
  type MetodoBalcao,
} from "@/lib/billing/balcao";

type Ctx = { params: Promise<{ id: string }> };

/** O que o balcão vai cobrar: plano de vários meses sai pelo valor inteiro. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados");
  if (g.erro) return g.erro;
  const { id } = await params;
  const venda = await vendaDeBalcao(id);
  if (!venda) return NextResponse.json({ erro: "Nenhuma cobrança pendente para esta pessoa" }, { status: 404 });
  return NextResponse.json(venda);
}

/** Venda de balcão: confirma o pagamento na própria plataforma (dinheiro/pix/cartão presencial). */
export async function POST(req: Request, { params }: Ctx) {
  const g = await exigirModuloApi("matriculados");
  if (g.erro) return g.erro;
  const { id } = await params;

  const body = (await req.json()) as { metodo?: string; parcelas?: number };
  if (!body.metodo || !METODOS_BALCAO.includes(body.metodo as MetodoBalcao)) {
    return NextResponse.json(
      { erro: "metodo inválido (dinheiro | pix | debito | credito)" },
      { status: 400 },
    );
  }
  const metodo = body.metodo as MetodoBalcao;

  try {
    const venda = await confirmarVendaBalcao(id, metodo, body.parcelas ?? 1);
    return NextResponse.json({ ok: true, status: "pago", metodo, valor: venda.valorPago, parcelas: venda.parcelas });
  } catch (e) {
    if (e instanceof VendaBalcaoInvalida) return NextResponse.json({ erro: e.message }, { status: e.status });
    console.error("[checkout] venda de balcão falhou:", e);
    return NextResponse.json(
      { erro: e instanceof AsaasError ? e.message : "Falha ao dar baixa no Asaas" },
      { status: 502 },
    );
  }
}
