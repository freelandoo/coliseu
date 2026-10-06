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
  /**
   * Como o botão "Liberar catraca" destrava o giro. "auto" (default) tenta
   * catra → sec_box → door e fica com a primeira que o aparelho aceitar.
   * `door` sozinho só aciona o relé de porta — numa catraca ele registra
   * "Interface WEB" mas NÃO destrava o braço (visto em campo, 06/10/2026).
   */
  openAction?: "auto" | "catra" | "sec_box" | "door";
  /** sentido liberado na ação catra: clockwise | anticlockwise | both. Default both. */
  catraAllow?: string;
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
  private readonly openAction: "auto" | "catra" | "sec_box" | "door";
  private readonly catraAllow: string;
  /** Ação que funcionou no modo auto — as próximas liberações vão direto nela. */
  private acaoQueFunciona: "catra" | "sec_box" | "door" | null = null;
  private readonly logPageSize: number;
  private readonly mapOptions: MapOptions;

  constructor(opts: ControlIdAdapterOptions) {
    this.client = new ControlIdClient(opts);
    this.accessRuleId = opts.accessRuleId ?? 1;
    this.doorId = opts.doorId ?? 1;
    this.openAction = opts.openAction ?? "auto";
    this.catraAllow = opts.catraAllow ?? "both";
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
    // create_or_modify: re-provisionar usuário existente NÃO pode falhar por id duplicado.
    await this.client.post("/create_or_modify_objects.fcgi", {
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
    // sync=true + auto=true + countdown: captura automática — detectou a face, conta 3s e
    // confirma a foto sozinho, sem tocar na tela (o auto só vale no modo síncrono). A
    // chamada fica aberta até a captura terminar, por isso o timeout estendido; o sucesso
    // aqui é a captura CONCLUÍDA, então o ack do comando vira a credencial cadastrada.
    const payload = {
      type,
      user_id: Number(input.externalUserId),
      save: true,
      sync: true,
      panic: false,
      auto: true,
      countdown: 3,
    };
    console.log(`[${new Date().toISOString()}] [enroll] remote_enroll enviado: ${JSON.stringify(payload)} — aguardando captura (ate 90s)...`);
    const res = await this.client.post<{ success?: boolean; error?: string; user_image?: string }>(
      "/remote_enroll.fcgi",
      payload,
      90_000,
    );
    // loga a resposta crua do aparelho (sem a foto base64) — diagnóstico de campo.
    const { user_image, ...semFoto } = res as Record<string, unknown>;
    console.log(`[${new Date().toISOString()}] [enroll] resposta do aparelho: ${JSON.stringify(semFoto)}${user_image ? " (+user_image)" : ""}`);
    if (res.success === false) {
      // FACE_EXISTS = rosto já cadastrado em outro usuário do aparelho (ex.: legado do
      // sistema antigo) — precisa excluir o usuário antigo no iDFace antes de recadastrar.
      const motivo = res.error === "FACE_EXISTS"
        ? "face já cadastrada em outro usuário do aparelho (exclua o cadastro antigo no iDFace)"
        : (res.error ?? "erro desconhecido");
      throw new Error(`cadastro facial falhou no aparelho: ${motivo}`);
    }
    return { sessionId: `${input.externalUserId}:${type}`, status: "ENROLLED" };
  }

  async cancelBiometricEnrollment(_sessionId: string): Promise<void> {
    await this.client.post("/cancel_remote_enroll.fcgi", {});
  }

  /**
   * Primeira execução (sem cursor): pula o histórico pré-integração. Percorre os ids
   * existentes no device (só ids, sem emitir eventos) e posiciona o cursor no maior.
   * Sem isso, um device com milhares de logs antigos inundaria o backend com giros
   * retroativos (e presenças antigas) logo após a instalação.
   */
  private async bootstrapCursor(): Promise<string> {
    let acc = 0;
    for (;;) {
      const res = await this.client.post<{ access_logs?: Array<{ id: number }> }>("/load_objects.fcgi", {
        object: "access_logs",
        fields: ["id"],
        where: [{ object: "access_logs", field: "id", operator: ">", value: acc }],
        order: ["id"],
        limit: 1000,
      });
      const logs = res.access_logs ?? [];
      if (logs.length === 0) break;
      acc = logs.reduce((m, l) => Math.max(m, l.id), acc);
      if (logs.length < 1000) break;
    }
    return String(acc);
  }

  async pullAccessEvents(cursor?: string): Promise<AccessEventBatch> {
    if (!cursor) {
      const inicio = await this.bootstrapCursor();
      return { events: [], cursor: inicio };
    }
    const lastId = Number(cursor);
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

  private acaoCatraca(tipo: "catra" | "sec_box" | "door") {
    if (tipo === "catra") return { action: "catra", parameters: `allow=${this.catraAllow}` };
    // SecBox (módulo de acionamento externo): id fixo 65793, reason 3 = interface/API.
    if (tipo === "sec_box") return { action: "sec_box", parameters: "id=65793,reason=3" };
    return { action: "door", parameters: `door=${this.doorId}` };
  }

  async openTurnstile(_direction: AccessDirection): Promise<void> {
    const ordem: Array<"catra" | "sec_box" | "door"> =
      this.openAction !== "auto"
        ? [this.openAction]
        : this.acaoQueFunciona
          ? [this.acaoQueFunciona]
          : ["catra", "sec_box", "door"];
    let ultimoErro: unknown = null;
    for (const tipo of ordem) {
      try {
        await this.client.post("/execute_actions.fcgi", { actions: [this.acaoCatraca(tipo)] });
        if (this.acaoQueFunciona !== tipo) {
          console.log(`[${new Date().toISOString()}] [liberar] catraca liberada pela ação "${tipo}"`);
        }
        this.acaoQueFunciona = tipo;
        return;
      } catch (e) {
        ultimoErro = e;
        console.log(`[${new Date().toISOString()}] [liberar] ação "${tipo}" recusada pelo aparelho: ${e instanceof Error ? e.message : e}`);
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error("nenhuma ação de liberação aceita pelo aparelho");
  }
}
