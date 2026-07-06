import { FakeDeviceAdapter } from "./adapters/fake-device.js";
import { heartbeat, pullCommands, ackCommand, pushEvent } from "./backend-client.js";

const DEVICE_ID = process.env.DEVICE_ID;
if (!DEVICE_ID) { console.error("Defina DEVICE_ID (id do AccessDevice)."); process.exit(1); }

const device = new FakeDeviceAdapter();

async function tick() {
  try {
    await heartbeat(DEVICE_ID!, "fake-1.0");

    // 1) puxa e executa comandos
    const cmds = await pullCommands(DEVICE_ID!);
    for (const c of cmds) {
      try {
        const p = (c.payload ?? {}) as { externalUserId?: string };
        if (c.type === "ENABLE" && p.externalUserId) await device.enableUser(p.externalUserId);
        else if (c.type === "DISABLE" && p.externalUserId) await device.disableUser(p.externalUserId);
        else if (c.type === "UPSERT_USER" && p.externalUserId) await device.upsertUser({ externalUserId: p.externalUserId, enabled: true });
        else if (c.type === "REMOVE_USER" && p.externalUserId) await device.removeUser(p.externalUserId);
        await ackCommand(c.id, "SUCCEEDED");
        console.log(`[agent] comando ${c.type} ok`);
      } catch (e) {
        await ackCommand(c.id, "FAILED", e instanceof Error ? e.message : String(e));
      }
    }

    // 2) gera um giro simulado ocasional
    if (Math.random() < 0.5) {
      const giro = device.simularGiro();
      if (giro) {
        await pushEvent({
          deviceId: DEVICE_ID, deviceEventId: giro.deviceEventId, externalUserId: giro.externalUserId,
          deviceTime: new Date().toISOString(), direction: "ENTRY",
          decision: giro.decision, reason: "OK", physicallyPassed: giro.physicallyPassed, mode: "ONLINE",
        });
        console.log(`[agent] giro simulado de ${giro.externalUserId}`);
      }
    }
  } catch (e) {
    console.error("[agent] tick falhou:", e instanceof Error ? e.message : e);
  }
}

const INTERVALO = Number(process.env.INTERVALO_MS ?? 5000);
console.log(`[agent] iniciando para device ${DEVICE_ID}, intervalo ${INTERVALO}ms`);
// bootstrap: o seed cria mapeamentos IN_SYNC mas sem comando pendente, então o fake não
// conhece ninguém até receber ENABLE/UPSERT. Para gerar giros de imediato no demo, use
// SEED_ENABLE=1001,1002,1003 para habilitar os externalUserId já sincronizados.
if (process.env.SEED_ENABLE) {
  for (const id of process.env.SEED_ENABLE.split(",")) void device.enableUser(id.trim());
}
setInterval(() => void tick(), INTERVALO);
void tick();
