import { NextResponse } from "next/server";
import { exigirAdminApi } from "@/lib/auth/api-guard";
import { AsaasError } from "@/lib/asaas";
import { cancelarAssinaturaDaPessoa } from "@/lib/billing/cobrancas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Cancela a assinatura recorrente (ADMIN): o Asaas para de gerar mensalidade.
 * O contrato não muda — o aluno segue com o que já pagou até o vencimento.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const g = await exigirAdminApi();
  if (g.erro) return g.erro;
  const { id } = await params;
  try {
    const canceladas = await cancelarAssinaturaDaPessoa(id);
    if (canceladas === 0) {
      return NextResponse.json({ erro: "Nenhuma assinatura ativa" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, canceladas });
  } catch (e) {
    const msg = e instanceof AsaasError ? e.message : "Falha ao cancelar no Asaas";
    console.error("[assinatura]", e);
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
