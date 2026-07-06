const BASE = process.env.BACKEND_URL ?? "http://localhost:3000";
const TOKEN = process.env.AGENT_TOKEN ?? "";

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (TOKEN) h["x-agent-token"] = TOKEN;
  return h;
}

export async function heartbeat(deviceId: string, firmware: string) {
  await fetch(`${BASE}/api/agent/heartbeat`, { method: "POST", headers: headers(), body: JSON.stringify({ deviceId, firmware, connectivity: "ok" }) });
}

export async function pullCommands(deviceId: string): Promise<Array<{ id: string; type: string; payload: unknown }>> {
  const r = await fetch(`${BASE}/api/agent/commands?deviceId=${deviceId}`, { headers: headers() });
  if (!r.ok) return [];
  return r.json();
}

export async function ackCommand(commandId: string, status: "SUCCEEDED" | "FAILED", error?: string) {
  await fetch(`${BASE}/api/agent/commands/ack`, { method: "POST", headers: headers(), body: JSON.stringify({ commandId, status, error }) });
}

export async function pushEvent(ev: Record<string, unknown>) {
  await fetch(`${BASE}/api/agent/events`, { method: "POST", headers: headers(), body: JSON.stringify(ev) });
}
