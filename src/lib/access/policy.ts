import type { AccessContext, AccessDecision } from "@/lib/access/types";

/**
 * Decisão central de acesso — função PURA (sem I/O).
 * Ordem de precedência: override manual > credencial/sync > contrato/financeiro.
 */
export function evaluateAccessEligibility(ctx: AccessContext): AccessDecision {
  // 1) Override manual vence tudo.
  if (ctx.overrideAtivo === "BLOCK") {
    return { allow: false, status: "MANUAL_OVERRIDE", reason: "OVERRIDE_BLOCK", consumirCortesia: false };
  }
  if (ctx.overrideAtivo === "ALLOW") {
    return { allow: true, status: "MANUAL_OVERRIDE", reason: "OVERRIDE_ALLOW", consumirCortesia: false };
  }

  // 2) Precisa de credencial cadastrada e sincronizada para girar.
  if (!ctx.temCredencialEnrolled) {
    return { allow: false, status: "PENDING_ENROLLMENT", reason: "SEM_BIOMETRIA", consumirCortesia: false };
  }
  if (!ctx.sincronizado) {
    return { allow: false, status: "PENDING_SYNC", reason: "AGUARDANDO_SYNC", consumirCortesia: false };
  }

  // 3) Contrato encerrado/cancelado.
  if (ctx.membershipStatus === "CANCELED") {
    return { allow: false, status: "DENIED", reason: "CANCELADO", consumirCortesia: false };
  }
  if (ctx.membershipStatus === "EXPIRED") {
    return { allow: false, status: "DENIED", reason: "EXPIRADO", consumirCortesia: false };
  }
  if (ctx.membershipStatus === "SUSPENDED" && ctx.billingStatus !== "OVERDUE") {
    return { allow: false, status: "DENIED", reason: "SUSPENSO", consumirCortesia: false };
  }

  // 4) Estorno / chargeback = nega imediato.
  if (ctx.billingStatus === "REFUNDED" || ctx.billingStatus === "CHARGEBACK") {
    return { allow: false, status: "DENIED", reason: "INADIMPLENTE", consumirCortesia: false };
  }

  // 5) Aguardando 1º pagamento → 1 acesso de cortesia.
  if (ctx.membershipStatus === "PENDING_PAYMENT" || ctx.billingStatus === "PENDING") {
    if (ctx.courtesyEntriesLeft > 0) {
      return { allow: true, status: "ALLOWED", reason: "CORTESIA", consumirCortesia: true };
    }
    return { allow: false, status: "DENIED", reason: "AGUARDANDO_PAGAMENTO", consumirCortesia: false };
  }

  // 6) Vencido → carência.
  if (ctx.billingStatus === "OVERDUE") {
    if (ctx.diasAtraso <= ctx.graceDays) {
      return { allow: true, status: "GRACE", reason: "EM_CARENCIA", consumirCortesia: false };
    }
    return { allow: false, status: "DENIED", reason: "INADIMPLENTE", consumirCortesia: false };
  }

  // 7) Em dia e pago.
  if (ctx.membershipStatus === "ACTIVE" && ctx.billingStatus === "PAID") {
    return { allow: true, status: "ALLOWED", reason: "OK", consumirCortesia: false };
  }

  // Fallback conservador.
  return { allow: false, status: "DENIED", reason: "INADIMPLENTE", consumirCortesia: false };
}
