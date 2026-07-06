export interface FakeUser { externalUserId: string; enabled: boolean; }

export class FakeDeviceAdapter {
  private users = new Map<string, FakeUser>();
  private seq = 0;

  async testConnection() { return { online: true, firmware: "fake-1.0", clockDriftMs: 0 }; }
  async upsertUser(u: { externalUserId: string; enabled: boolean }) {
    this.users.set(u.externalUserId, { externalUserId: u.externalUserId, enabled: u.enabled });
    return { externalUserId: u.externalUserId };
  }
  async removeUser(id: string) { this.users.delete(id); }
  async enableUser(id: string) { const u = this.users.get(id); if (u) u.enabled = true; else this.users.set(id, { externalUserId: id, enabled: true }); }
  async disableUser(id: string) { const u = this.users.get(id); if (u) u.enabled = false; }

  /** Gera um giro simulado de um usuário habilitado aleatório (ou null se não há ninguém). */
  simularGiro(): { deviceEventId: string; externalUserId: string; decision: "ALLOWED" | "DENIED"; physicallyPassed: boolean } | null {
    const habilitados = [...this.users.values()].filter((u) => u.enabled);
    if (habilitados.length === 0) return null;
    const u = habilitados[Math.floor(Math.random() * habilitados.length)];
    this.seq += 1;
    return { deviceEventId: `fake-${Date.now()}-${this.seq}`, externalUserId: u.externalUserId, decision: "ALLOWED", physicallyPassed: true };
  }
}
