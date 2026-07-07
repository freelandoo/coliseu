import type {
  AccessDeviceAdapter,
  AccessDirection,
  AccessEventBatch,
  DeviceHealth,
  DeviceUserInput,
  DeviceUserResult,
  EnrollmentInput,
  EnrollmentResult,
} from "../types.js";
import { ControlIdClient, type ControlIdClientOptions } from "./client.js";
import { mapAccessLog, type ControlIdAccessLog, type MapOptions } from "./mapping.js";

export interface ControlIdAdapterOptions extends ControlIdClientOptions {
  /** access_rule vinculada ao habilitar um usuário (link=enable / unlink=disable). Default 1. */
  accessRuleId?: number;
  /** portal físico acionado (door=N em execute_actions). Default 1. */
  doorId?: number;
  /** nº máximo de access_logs puxados por ciclo. Default 100. */
  logPageSize?: number;
  /** mapeamento de saída para pullAccessEvents. */
  mapOptions?: MapOptions;
}

/**
 * Driver real do Control iD iDFace (Fase 5). Implementa o mesmo contrato
 * AccessDeviceAdapter do FakeDeviceAdapter — o loop do agente não muda.
 */
export class ControlIdDeviceAdapter implements AccessDeviceAdapter {
  private readonly client: ControlIdClient;
  private readonly accessRuleId: number;
  private readonly doorId: number;
  private readonly logPageSize: number;
  private readonly mapOptions: MapOptions;

  constructor(opts: ControlIdAdapterOptions) {
    this.client = new ControlIdClient(opts);
    this.accessRuleId = opts.accessRuleId ?? 1;
    this.doorId = opts.doorId ?? 1;
    this.logPageSize = opts.logPageSize ?? 100;
    this.mapOptions = opts.mapOptions ?? {};
  }

  async testConnection(): Promise<DeviceHealth> {
    await this.client.ensureSession();
    let firmware: string | undefined;
    try {
      const info = await this.client.post<{ version?: string }>("/system_information.fcgi", {});
      firmware = info.version;
    } catch {
      // system_information é best-effort; a sessão válida já prova conectividade.
    }
    return { online: true, firmware };
  }

  async upsertUser(input: DeviceUserInput): Promise<DeviceUserResult> {
    const id = Number(input.externalUserId);
    await this.client.post("/create_objects.fcgi", {
      object: "users",
      values: [{ id, name: input.nome, registration: input.externalUserId }],
    });
    if (input.enabled) await this.enableUser(input.externalUserId);
    return { externalUserId: input.externalUserId };
  }

  async removeUser(externalUserId: string): Promise<void> {
    const id = Number(externalUserId);
    await this.client.post("/destroy_objects.fcgi", {
      object: "users",
      where: { users: { id } },
    });
  }

  async enableUser(externalUserId: string): Promise<void> {
    const user_id = Number(externalUserId);
    // idempotente: remove vínculo prévio e recria, evitando duplicidade.
    await this.client.post("/destroy_objects.fcgi", {
      object: "user_access_rules",
      where: { user_access_rules: { user_id } },
    });
    await this.client.post("/create_objects.fcgi", {
      object: "user_access_rules",
      values: [{ user_id, access_rule_id: this.accessRuleId }],
    });
  }

  async disableUser(externalUserId: string): Promise<void> {
    const user_id = Number(externalUserId);
    await this.client.post("/destroy_objects.fcgi", {
      object: "user_access_rules",
      where: { user_access_rules: { user_id } },
    });
  }

  async startBiometricEnrollment(input: EnrollmentInput): Promise<EnrollmentResult> {
    const type = input.type === "FACE" ? "face" : input.type === "CARD" ? "card" : "pin";
    // save=true grava no usuário; sync=false devolve resultado via monitor/consulta posterior.
    await this.client.post("/remote_enroll.fcgi", {
      type,
      user_id: Number(input.externalUserId),
      save: true,
      sync: false,
      panic: false,
    });
    return { sessionId: `${input.externalUserId}:${type}`, status: "IN_PROGRESS" };
  }

  async cancelBiometricEnrollment(_sessionId: string): Promise<void> {
    await this.client.post("/cancel_remote_enroll.fcgi", {});
  }

  async pullAccessEvents(cursor?: string): Promise<AccessEventBatch> {
    const lastId = cursor ? Number(cursor) : 0;
    const res = await this.client.post<{ access_logs?: ControlIdAccessLog[] }>("/load_objects.fcgi", {
      object: "access_logs",
      where: [{ object: "access_logs", field: "id", operator: ">", value: lastId }],
      order: ["id"],
      limit: this.logPageSize,
    });

    // Rede de segurança: filtra por id > cursor no cliente (caso o where do device
    // não aplique o operador como esperado) e ordena de forma determinística.
    const logs = (res.access_logs ?? [])
      .filter((l) => l.id > lastId)
      .sort((a, b) => a.id - b.id)
      .slice(0, this.logPageSize);

    const events = logs
      .map((l) => mapAccessLog(l, this.mapOptions))
      .filter((e): e is NonNullable<typeof e> => e !== null);

    // Cursor avança pelo maior id VISTO (mesmo de logs não mapeados) para não reprocessar.
    const maxId = logs.reduce((m, l) => Math.max(m, l.id), lastId);
    return { events, cursor: maxId > lastId ? String(maxId) : cursor };
  }

  async openTurnstile(_direction: AccessDirection): Promise<void> {
    await this.client.post("/execute_actions.fcgi", {
      actions: [{ action: "door", parameters: `door=${this.doorId}` }],
    });
  }
}
