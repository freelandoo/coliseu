const BASE = process.env.BACKEND_URL ?? "http://localhost:3000";
const TOKEN = process.env.AGENT_TOKEN ?? "";

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) h["x-agent-token"] = TOKEN;
  return h;
}

/**
 * Com `precisaCursor`, o servidor devolve o último log do aparelho que ele já
 * recebeu (null se nenhum; servidor antigo nem manda o campo).
 */
export async function heartbeat(deviceId: string, firmware: string, precisaCursor = false): Promise<{ cursor?: string | null }> {
  const r = await fetch(`${BASE}/api/agent/heartbeat`, { method: "POST", headers: headers(), body: JSON.stringify({ deviceId, firmware, connectivity: "ok", ...(precisaCursor ? { precisaCursor: true } : {}) }) });
  if (!r.ok) throw new Error(`heartbeat HTTP ${r.status}`);
  return (await r.json().catch(() => ({}))) as { cursor?: string | null };
}

export async function pullCommands(deviceId: string): Promise<Array<{ id: string; type: string; payload: unknown }>> {
  const r = await fetch(`${BASE}/api/agent/commands?deviceId=${deviceId}`, { headers: headers() });
  if (!r.ok) throw new Error(`commands HTTP ${r.status}`);
  return r.json();
}

export async function ackCommand(
  commandId: string, status: "SUCCEEDED" | "FAILED", error?: string, result?: { userImage?: string },
) {
  const r = await fetch(`${BASE}/api/agent/commands/ack`, { method: "POST", headers: headers(), body: JSON.stringify({ commandId, status, error, ...(result ? { result } : {}) }) });
  if (!r.ok) throw new Error(`ack HTTP ${r.status}`);
}

/** Lança em falha (rede ou HTTP) — o agente NÃO deve avançar o cursor sobre push falho. */
export async function pushEvent(ev: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/agent/events`, { method: "POST", headers: headers(), body: JSON.stringify(ev) });
  if (!r.ok) throw new Error(`events HTTP ${r.status}`);
}
