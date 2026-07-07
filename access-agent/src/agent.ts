import { readFileSync, writeFileSync } from "node:fs";
import { FakeDeviceAdapter } from "./adapters/fake-device.js";
import { ControlIdDeviceAdapter } from "./adapters/controlid/controlid-device.js";
import type { AccessDeviceAdapter, AccessEventRecord } from "./adapters/types.js";
import { checkEnv } from "./env-check.js";
import { heartbeat, pullCommands, ackCommand, pushEvent } from "./backend-client.js";

// ---- validação de config (usada pelo install.bat do kit via --check) ----
const faltantes = checkEnv(process.env);
if (process.argv.includes("--check")) {
  if (faltantes.length > 0) {
    console.error(`[ERRO] Campos faltando no .env: ${faltantes.join(", ")}`);
    process.exit(1);
  }
  console.log("[ok] configuração válida");
  process.exit(0);
}
if (faltantes.length > 0) {
  console.error(`[agent] configuração incompleta (.env): ${faltantes.join(", ")}`);
  process.exit(1);
}

const DEVICE_ID = process.env.DEVICE_ID!;

// Seleção de adapter: 'fake' (Fase 4, default) ou 'controlid' (Fase 5, driver real iDFace).
const ADAPTER = (process.env.ADAPTER ?? "fake").toLowerCase();
let device: AccessDeviceAdapter;
let firmwareTag = "fake-1.0";
if (ADAPTER === "controlid") {
  device = new ControlIdDeviceAdapter({
    host: process.env.IDFACE_HOST!,
    login: process.env.IDFACE_USER ?? "admin",
    password: process.env.IDFACE_PASS!,
    accessRuleId: process.env.IDFACE_RULE_ID ? Number(process.env.IDFACE_RULE_ID) : undefined,
    doorId: process.env.IDFACE_DOOR_ID ? Number(process.env.IDFACE_DOOR_ID) : undefined,
  });
  firmwareTag = "controlid-idface";
} else {
  device = new FakeDeviceAdapter();
}

// ---- log de estado (1 linha por transição, sem spam) ----
function ts() { return new Date().toISOString(); }
let nuvemOnline: boolean | null = null; // null = ainda não sabemos
function marcarNuvem(ok: boolean) {
  if (nuvemOnline === ok) return;
  nuvemOnline = ok;
  if (ok) console.log(`[${ts()}] ONLINE: nuvem reconectada — sincronizando`);
  else console.log(`[${ts()}] OFFLINE: nuvem inacessível — catraca segue decidindo localmente; eventos ficam retidos no dispositivo`);
}
let deviceOnline: boolean | null = null;
function marcarDevice(ok: boolean) {
  if (deviceOnline === ok) return;
  deviceOnline = ok;
  if (ok) console.log(`[${ts()}] DEVICE OK: catraca acessível`);
  else console.log(`[${ts()}] DEVICE FALHOU: catraca inacessível — confira IDFACE_HOST/rede local`);
}

// ---- cursor de eventos persistido em disco (não reprocessar após restart) ----
const CURSOR_FILE = `.agent-cursor-${DEVICE_ID}`;
function loadCursor(): string | undefined {
  try { return readFileSync(CURSOR_FILE, "utf8").trim() || undefined; } catch { return undefined; }
}
function saveCursor(cursor?: string): void {
  if (cursor) try { writeFileSync(CURSOR_FILE, cursor); } catch { /* best-effort */ }
}
let cursor = loadCursor();

async function pushUmEvento(ev: AccessEventRecord): Promise<void> {
  await pushEvent({
    deviceId: DEVICE_ID,
    deviceEventId: ev.deviceEventId,
    externalUserId: ev.externalUserId,
    deviceTime: ev.deviceTime,
    direction: ev.direction,
    decision: ev.decision,
    reason: ev.reason,
    physicallyPassed: ev.physicallyPassed,
    mode: ev.mode,
    cursor: ev.cursor,
  });
}

/**
 * Tick em etapas INDEPENDENTES: falha na nuvem não impede falar com a catraca e
 * vice-versa. É o que mantém o agente útil durante queda de internet.
 * Reentrância: um tick lento (timeouts encadeados > INTERVALO) NÃO pode sobrepor
 * o próximo — sobreposição causa corrida de sessão no device e de cursor no disco.
 */
let tickEmExecucao = false;
async function tick() {
  if (tickEmExecucao) return;
  tickEmExecucao = true;
  try {
    await tickInterno();
  } finally {
    tickEmExecucao = false;
  }
}

async function tickInterno() {
  // Etapa A — heartbeat (nuvem)
  try {
    await heartbeat(DEVICE_ID, firmwareTag);
    marcarNuvem(true);
  } catch {
    marcarNuvem(false);
  }

  // Etapa B — comandos (nuvem -> device); só tenta com nuvem de pé
  if (nuvemOnline) {
    try {
      const cmds = await pullCommands(DEVICE_ID);
      for (const c of cmds) {
        try {
          const p = (c.payload ?? {}) as { externalUserId?: string; nome?: string; type?: "FACE" | "CARD" | "PIN"; direction?: "ENTRY" | "EXIT" };
          if (c.type === "ENABLE" && p.externalUserId) await device.enableUser(p.externalUserId);
          else if (c.type === "DISABLE" && p.externalUserId) await device.disableUser(p.externalUserId);
          else if (c.type === "UPSERT_USER" && p.externalUserId) await device.upsertUser({ externalUserId: p.externalUserId, nome: p.nome ?? p.externalUserId, enabled: true });
          else if (c.type === "REMOVE_USER" && p.externalUserId) await device.removeUser(p.externalUserId);
          else if (c.type === "ENROLL" && p.externalUserId) await device.startBiometricEnrollment({ externalUserId: p.externalUserId, type: p.type ?? "FACE" });
          else if (c.type === "OPEN") await device.openTurnstile({ direction: p.direction ?? "ENTRY" });
          await ackCommand(c.id, "SUCCEEDED");
          console.log(`[agent] comando ${c.type} ok`);
        } catch (e) {
          try { await ackCommand(c.id, "FAILED", e instanceof Error ? e.message : String(e)); } catch { /* nuvem caiu no meio */ }
        }
      }
    } catch (e) {
      console.error(`[agent] etapa de comandos falhou: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Etapa C — eventos (device -> nuvem)
  let batch: { events: AccessEventRecord[]; cursor?: string } | null = null;
  try {
    batch = await device.pullAccessEvents(cursor);
    marcarDevice(true);
  } catch {
    marcarDevice(false);
  }
  if (batch) {
    // Push evento a evento; cursor SÓ avança até o último enviado com sucesso —
    // se a nuvem cair no meio, os restantes seguem no device para a próxima tentativa.
    let ultimoEnviado: string | undefined;
    let falhou = false;
    for (const ev of batch.events) {
      try {
        await pushUmEvento(ev);
        ultimoEnviado = ev.cursor ?? ev.deviceEventId;
        console.log(`[agent] evento ${ev.decision} de ${ev.externalUserId ?? "?"}`);
      } catch {
        marcarNuvem(false);
        falhou = true;
        break;
      }
    }
    const novoCursor = falhou ? ultimoEnviado : (batch.cursor ?? ultimoEnviado);
    if (novoCursor && novoCursor !== cursor) {
      cursor = novoCursor;
      saveCursor(cursor);
    }
  }
}

const INTERVALO = Number(process.env.INTERVALO_MS ?? 5000);
console.log(`[${ts()}] [agent] iniciando (adapter=${ADAPTER}) para device ${DEVICE_ID}, intervalo ${INTERVALO}ms`);
// bootstrap: o seed cria mapeamentos IN_SYNC mas sem comando pendente. Para gerar giros de
// imediato no demo (modo fake), use SEED_ENABLE=1001,1002,1003 para habilitar os
// externalUserId já sincronizados.
if (process.env.SEED_ENABLE) {
  for (const id of process.env.SEED_ENABLE.split(",")) void device.enableUser(id.trim());
}
setInterval(() => void tick(), INTERVALO);
void tick();
