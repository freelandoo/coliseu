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
  const payments: AsaasPaymentLike[] = await listarPaymentsAsaas();
  const res = await reconciliarPayments(payments);
  return NextResponse.json(res);
}
