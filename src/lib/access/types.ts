export type AccessStatus =
  | "PENDING_ENROLLMENT"
  | "PENDING_SYNC"
  | "ALLOWED"
  | "GRACE"
  | "DENIED"
  | "MANUAL_OVERRIDE";

export type AccessReason =
  | "OK"
  | "SEM_BIOMETRIA"
  | "AGUARDANDO_SYNC"
  | "AGUARDANDO_PAGAMENTO"
  | "CORTESIA"
  | "EM_CARENCIA"
  | "INADIMPLENTE"
  | "CANCELADO"
  | "EXPIRADO"
  | "SUSPENSO"
  | "OVERRIDE_ALLOW"
  | "OVERRIDE_BLOCK"
  | "FORA_DE_HORARIO";

export interface AccessContext {
  membershipStatus: "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELED" | "EXPIRED" | null;
  billingStatus: "PENDING" | "PAID" | "OVERDUE" | "REFUNDED" | "CHARGEBACK" | "CANCELED" | null;
  diasAtraso: number;        // dias desde o vencimento (>0 = vencido). 0/neg = em dia
  graceDays: number;         // carência configurada (default 5)
  courtesyEntriesLeft: number;
  temCredencialEnrolled: boolean;
  sincronizado: boolean;     // pelo menos um DeviceUserMapping IN_SYNC
  overrideAtivo: "ALLOW" | "BLOCK" | null;
  agora: Date;
}

export interface AccessDecision {
  allow: boolean;
  status: AccessStatus;
  reason: AccessReason;
  consumirCortesia: boolean; // true quando a liberação usa 1 crédito de cortesia
}
