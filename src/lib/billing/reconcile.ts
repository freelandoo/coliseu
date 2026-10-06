import type { AsaasPaymentLike } from "@/lib/asaas";
import { aplicarPagamento, statusDoAsaas } from "@/lib/billing/aplicar";

export type { AsaasPaymentLike } from "@/lib/asaas";

/**
 * Reconciliação: o Asaas é a fonte da verdade. Corrige o que o webhook perdeu
 * (servidor fora do ar, evento rejeitado). Cobrança de cliente que o Coliseu
 * não conhece (conta compartilhada) é ignorada.
 */
export async function reconciliarPayments(
  asaasPayments: AsaasPaymentLike[],
): Promise<{ criados: number; atualizados: number; ignorados: number; total: number }> {
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  for (const ap of asaasPayments) {
    const r = await aplicarPagamento(ap, statusDoAsaas(ap.status), new Date());
    if (r.ignorado) ignorados++;
    else if (r.criado) criados++;
    else atualizados++;
  }
  return { criados, atualizados, ignorados, total: asaasPayments.length };
}
