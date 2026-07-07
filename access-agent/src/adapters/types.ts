// Espelho local do contrato do backend (src/lib/access/device-adapter.ts).
// O access-agent é um pacote separado e NÃO importa de src/lib — a fonte de verdade
// da interface continua no backend; mantenha os dois em sincronia ao evoluir o contrato.

export interface DeviceHealth {
  online: boolean;
  firmware?: string;
  clockDriftMs?: number;
}

export interface DeviceUserInput {
  externalUserId: string;
  nome: string;
  enabled: boolean;
}

export interface DeviceUserResult {
  externalUserId: string;
}

export interface AccessDirection {
  direction: "ENTRY" | "EXIT";
}

export interface AccessEventRecord {
  deviceEventId: string;
  externalUserId?: string;
  deviceTime: string; // ISO
  direction: "ENTRY" | "EXIT";
  decision: "ALLOWED" | "DENIED";
  reason?: string;
  physicallyPassed: boolean;
  mode: "ONLINE" | "OFFLINE" | "CONTINGENCY";
  cursor?: string;
}

export interface AccessEventBatch {
  events: AccessEventRecord[];
  cursor?: string;
}

export interface EnrollmentInput {
  externalUserId: string;
  type: "FACE" | "CARD" | "PIN";
}

export interface EnrollmentResult {
  sessionId: string;
  status: "IN_PROGRESS" | "ENROLLED" | "FAILED";
}

/** Contrato independente de fabricante. FakeDeviceAdapter (Fase 4) e ControlId (Fase 5). */
export interface AccessDeviceAdapter {
  testConnection(): Promise<DeviceHealth>;
  upsertUser(input: DeviceUserInput): Promise<DeviceUserResult>;
  removeUser(externalUserId: string): Promise<void>;
  enableUser(externalUserId: string): Promise<void>;
  disableUser(externalUserId: string): Promise<void>;
  startBiometricEnrollment(input: EnrollmentInput): Promise<EnrollmentResult>;
  cancelBiometricEnrollment(sessionId: string): Promise<void>;
  pullAccessEvents(cursor?: string): Promise<AccessEventBatch>;
  openTurnstile(direction: AccessDirection): Promise<void>;
}
