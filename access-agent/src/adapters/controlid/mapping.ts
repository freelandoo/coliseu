import type { AccessEventRecord } from "../types.js";

// Registro bruto da tabela `access_logs` do device (campos relevantes; ver doc
// "List of objects" da API Acesso Control iD).
export interface ControlIdAccessLog {
  id: number;
  time: number; // Unix timestamp (segundos)
  event: number; // código de evento (ver EVENT abaixo)
  user_id?: number;
  portal_id?: number;
  card_value?: number;
}

// Códigos de `access_logs.event` (API Acesso Control iD — "List of objects").
export const EVENT = {
  INVALID_DEVICE: 1,
  INVALID_RULE_PARAMS: 2,
  NOT_IDENTIFIED: 3,
  PENDING_IDENTIFICATION: 4,
  ID_TIME_EXPIRED: 5,
  ACCESS_DENIED: 6,
  ACCESS_GRANTED: 7,
  PENDING_ACCESS: 8,
  NOT_ADMIN: 9,
  NON_IDENTIFIED_ACCESS: 10, // abertura de portal via API
  PUSHBUTTON: 11, // botoeira
  WEB_INTERFACE: 12,
  CANCEL_ENTRY: 13, // exclusivo iDBlock
  NO_RESPONSE: 14,
  INTERCOM: 15, // exclusivo iDFace
} as const;

const ALLOWED = new Set<number>([
  EVENT.ACCESS_GRANTED,
  EVENT.NON_IDENTIFIED_ACCESS,
  EVENT.PUSHBUTTON,
  EVENT.WEB_INTERFACE,
]);

const DENIED = new Set<number>([
  EVENT.NOT_IDENTIFIED,
  EVENT.ID_TIME_EXPIRED,
  EVENT.ACCESS_DENIED,
  EVENT.PENDING_ACCESS,
  EVENT.NOT_ADMIN,
]);

const REASON: Record<number, string> = {
  [EVENT.NOT_IDENTIFIED]: "Não identificado",
  [EVENT.ID_TIME_EXPIRED]: "Tempo de identificação expirado",
  [EVENT.ACCESS_DENIED]: "Acesso negado",
  [EVENT.ACCESS_GRANTED]: "Acesso concedido",
  [EVENT.PENDING_ACCESS]: "Acesso pendente (aprovação)",
  [EVENT.NOT_ADMIN]: "Usuário não é administrador",
  [EVENT.NON_IDENTIFIED_ACCESS]: "Abertura via API",
  [EVENT.PUSHBUTTON]: "Botoeira",
  [EVENT.WEB_INTERFACE]: "Interface WEB",
};

export interface MapOptions {
  /** portal_ids tratados como saída; qualquer outro é entrada (default: tudo entrada). */
  exitPortalIds?: number[];
}

/**
 * Traduz um `access_logs` do iDFace para o AccessEventRecord do backend.
 * Retorna null para eventos que não são decisão de acesso (device inválido, sem resposta,
 * intercom, cancelamento etc.) — esses não viram AccessEvent.
 *
 * IMPORTANTE (premissa do modo polling): `access_logs` não traz uma linha explícita de
 * "giro confirmado" — isso só existe no `catra_event` do Monitor push. Aqui adotamos
 * `Acesso concedido => physicallyPassed=true`. Se no futuro a exatidão do giro importar,
 * migrar para o Monitor `catra_event`. Calibrar aqui, isolado.
 */
export function mapAccessLog(log: ControlIdAccessLog, opts: MapOptions = {}): AccessEventRecord | null {
  const isAllowed = ALLOWED.has(log.event);
  const isDenied = DENIED.has(log.event);
  if (!isAllowed && !isDenied) return null;

  const direction: "ENTRY" | "EXIT" =
    log.portal_id != null && opts.exitPortalIds?.includes(log.portal_id) ? "EXIT" : "ENTRY";

  return {
    deviceEventId: String(log.id),
    externalUserId: log.user_id ? String(log.user_id) : undefined,
    deviceTime: new Date(log.time * 1000).toISOString(),
    direction,
    decision: isAllowed ? "ALLOWED" : "DENIED",
    reason: REASON[log.event] ?? `event=${log.event}`,
    physicallyPassed: isAllowed,
    mode: "ONLINE",
    cursor: String(log.id),
  };
}
