import type { CobrancaStatus, MembershipStatus } from "@prisma/client";

/** Contrato Gym Provider API — status de matrícula expostos à Freelandoo. */
export type GymMembershipStatus = "active" | "overdue" | "canceled" | "expired" | "pending";
/** Contrato Gym Provider API — status de pagamento expostos à Freelandoo. */
export type GymPaymentStatus = "pending" | "paid" | "overdue";

export function normalizarCpf(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function mapMembershipStatus(s: MembershipStatus): GymMembershipStatus {
  switch (s) {
    case "ACTIVE":
      return "active";
    case "SUSPENDED":
      return "overdue";
    case "CANCELED":
      return "canceled";
    case "EXPIRED":
      return "expired";
    case "DRAFT":
    case "PENDING_PAYMENT":
      return "pending";
  }
}

export function mapCobrancaStatus(s: CobrancaStatus): GymPaymentStatus {
  switch (s) {
    case "pago":
      return "paid";
    case "atrasado":
      return "overdue";
    case "pendente":
      return "pending";
  }
}

/** Cursor opaco: base64url de `<iso-timestamp>|<id>`. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): { at: Date; id: string } | null {
  if (!raw) return null;
  try {
    const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    const at = new Date(iso);
    if (!id || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}
