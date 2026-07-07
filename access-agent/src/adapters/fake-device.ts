import type {
  AccessDeviceAdapter,
  AccessDirection,
  AccessEventBatch,
  DeviceHealth,
  DeviceUserInput,
  DeviceUserResult,
  EnrollmentInput,
  EnrollmentResult,
} from "./types.js";

export interface FakeUser { externalUserId: string; enabled: boolean; }

/**
 * Adapter simulado (Fase 4). Mantém usuários habilitados em memória e gera giros
 * sintéticos. Implementa o mesmo contrato do driver real — o loop do agente é idêntico
 * nos dois modos.
 */
export class FakeDeviceAdapter implements AccessDeviceAdapter {
  private users = new Map<string, FakeUser>();
  private seq = 0;

  async testConnection(): Promise<DeviceHealth> {
    return { online: true, firmware: "fake-1.0", clockDriftMs: 0 };
  }

  async upsertUser(input: DeviceUserInput): Promise<DeviceUserResult> {
    this.users.set(input.externalUserId, { externalUserId: input.externalUserId, enabled: input.enabled });
    return { externalUserId: input.externalUserId };
  }

  async removeUser(id: string): Promise<void> { this.users.delete(id); }

  async enableUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) u.enabled = true;
    else this.users.set(id, { externalUserId: id, enabled: true });
  }

  async disableUser(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) u.enabled = false;
  }

  async startBiometricEnrollment(input: EnrollmentInput): Promise<EnrollmentResult> {
    // No fake, o enrollment "conclui" na hora.
    return { sessionId: `fake-enroll-${input.externalUserId}`, status: "ENROLLED" };
  }

  async cancelBiometricEnrollment(_sessionId: string): Promise<void> { /* no-op */ }

  async openTurnstile(_direction: AccessDirection): Promise<void> { /* no-op */ }

  /** Gera um giro simulado ocasional de um usuário habilitado (mesmo caminho do driver real). */
  async pullAccessEvents(cursor?: string): Promise<AccessEventBatch> {
    const giro = Math.random() < 0.5 ? this.simularGiro() : null;
    if (!giro) return { events: [], cursor };
    return {
      events: [{
        deviceEventId: giro.deviceEventId,
        externalUserId: giro.externalUserId,
        deviceTime: new Date().toISOString(),
        direction: "ENTRY",
        decision: giro.decision,
        reason: "OK",
        physicallyPassed: giro.physicallyPassed,
        mode: "ONLINE",
        cursor: giro.deviceEventId,
      }],
      cursor: giro.deviceEventId,
    };
  }

  /** Gera um giro simulado de um usuário habilitado aleatório (ou null se não há ninguém). */
  simularGiro(): { deviceEventId: string; externalUserId: string; decision: "ALLOWED" | "DENIED"; physicallyPassed: boolean } | null {
    const habilitados = [...this.users.values()].filter((u) => u.enabled);
    if (habilitados.length === 0) return null;
    const u = habilitados[Math.floor(Math.random() * habilitados.length)];
    this.seq += 1;
    return { deviceEventId: `fake-${Date.now()}-${this.seq}`, externalUserId: u.externalUserId, decision: "ALLOWED", physicallyPassed: true };
  }
}
