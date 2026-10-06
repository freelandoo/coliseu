import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { reconciliarPayments, type AsaasPaymentLike } from "@/lib/billing/reconcile";
import { listarPaymentsAsaas } from "@/lib/asaas";

export async function POST() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) {
    return g.erro ?? NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }
  if (!podePapel(g.user.role as Papel, ["ADMIN"])) {
    return NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 });
  }
  // Janela de 6 meses: cobre qualquer webhook perdido sem varrer a conta inteira.
  const desde = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const payments: AsaasPaymentLike[] = await listarPaymentsAsaas(desde);
  const res = await reconciliarPayments(payments);
  return NextResponse.json(res);
}
