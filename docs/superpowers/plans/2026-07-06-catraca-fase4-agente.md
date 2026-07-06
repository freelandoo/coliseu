# Catraca — Fase 4 (Agente local simulado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar o protocolo backend↔agente sem hardware: um serviço `access-agent` (Node/TS) que faz heartbeat, puxa `DeviceCommand`, executa via um `FakeDeviceAdapter`, dá ack, e empurra `AccessEvent` simulados — fechando o ciclo até o dashboard `/acesso` e a presença/retenção.

**Architecture:** O backend expõe uma API de agente (`/api/agent/*`) autenticada por um token compartilhado (`AGENT_TOKEN`, header `x-agent-token`), pública para o proxy mas token-gated como o webhook. O agente é um processo Node separado (`access-agent/`) com um loop: heartbeat → pull de comandos → executa no adapter → ack → gera giros simulados → push de eventos. A interface `AccessDeviceAdapter` (definida no backend, reusável) é implementada por `FakeDeviceAdapter` (agora) e, na Fase 5, pelo driver Control iD real. Ao dar ack SUCCEEDED de sync, o backend marca `DeviceUserMapping.syncStatus=IN_SYNC`; ao receber um `AccessEvent` ALLOWED+giro, atualiza `Membership.ultimaPresenca` (presença real).

**Tech Stack:** Backend: Next.js 16 route handlers + Prisma 6. Agente: Node/TS puro (fetch nativo do Node 24), sem framework. Vitest para os handlers. Sem deps novas no backend; o agente tem seu próprio `package.json` mínimo (usa só o runtime).

**Contexto (Fases 1-3 concluídas — ler antes):**
- Postgres via `docker compose up -d db`; Prisma 6; seed idempotente `npm run db:seed` (cria 1 `AccessDevice` "Catraca Principal" ONLINE + 3 alunos com `AccessCredential` FACE ENROLLED e `DeviceUserMapping` IN_SYNC).
- `DeviceCommand` tem `personId?`, `dedupeKey` único, `status` (PENDING|DISPATCHED|ACKNOWLEDGED|SUCCEEDED|FAILED|DEAD_LETTER). Repo `src/lib/repositories/access.ts` (`listarDevices`, `comandosPendentes`, `enfileirarComandoAcesso`, etc.). Outbox `src/lib/access/outbox.ts`.
- `AccessEvent`: unique `(deviceId, deviceEventId)`; campos `personId?, deviceTime, serverTime, direction, credentialType, decision, reason, physicallyPassed, mode, deviceCursor`.
- Auth: `src/lib/auth/api-guard.ts`, `rbac.ts`. Proxy `src/proxy.ts` tem `PUBLIC_PREFIXES = ["/login","/api/auth","/api/webhooks"]` + `/` liberado.
- Vitest SEQUENCIAL; reseed antes de testes que mutam. `.env`/`.env.local` — **não ler/expor**. Migrações aditivas; **pare o dev server antes de `prisma generate`/`migrate`** (lock da DLL no Windows). Rode `npm test` só após reseed.

**Decisão:** o agente é **simulado** nesta fase (nenhum I/O com dispositivo real). O `FakeDeviceAdapter` responde sucesso e gera giros sintéticos para usuários mapeados. O driver real do Control iD é a Fase 5 (troca só o adapter).

---

## Estrutura de arquivos (Fase 4)

**Novos (backend):**
- `src/lib/access/device-adapter.ts` — a interface `AccessDeviceAdapter` + tipos (`DeviceHealth`, `DeviceUserInput`, `AccessEventBatch`, etc.).
- `src/lib/agent/auth.ts` — `exigirAgente(req)` (token `x-agent-token`).
- `src/lib/agent/ingest.ts` — lógica de ingestão: `registrarHeartbeat`, `entregarComandos`, `ackComando`, `ingestarEvento`.
- `src/app/api/agent/heartbeat/route.ts`, `src/app/api/agent/commands/route.ts`, `src/app/api/agent/commands/ack/route.ts`, `src/app/api/agent/events/route.ts`.
- Testes: `src/lib/agent/ingest.test.ts`.

**Novos (serviço agente):**
- `access-agent/package.json`, `access-agent/tsconfig.json`
- `access-agent/src/adapters/fake-device.ts` — `FakeDeviceAdapter`.
- `access-agent/src/backend-client.ts` — chamadas HTTP ao backend.
- `access-agent/src/agent.ts` — loop principal.
- `access-agent/README.md`.

**Alterados:**
- `src/proxy.ts` — liberar `/api/agent` (token-gated na rota).
- `.env.example` — `AGENT_TOKEN`.
- `src/components/acesso/AcessoDashboard.tsx` — nada obrigatório (já mostra comandos/eventos); opcional: nada.

---

## Task 1: Interface do adapter + auth do agente + env

**Files:**
- Create: `src/lib/access/device-adapter.ts`, `src/lib/agent/auth.ts`
- Modify: `src/proxy.ts`, `.env.example`

- [ ] **Step 1: `src/lib/access/device-adapter.ts`** (interface + tipos, reflete o iDFace real da Fase 5)

```ts
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
```

- [ ] **Step 2: `src/lib/agent/auth.ts`**

```ts
import { NextResponse } from "next/server";

/** Valida o token do agente (header x-agent-token). Em produção exige AGENT_TOKEN. */
export function exigirAgente(req: Request): NextResponse | null {
  const expected = process.env.AGENT_TOKEN;
  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json({ error: "agent token not configured" }, { status: 503 });
  }
  if (expected && req.headers.get("x-agent-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null; // ok
}
```

- [ ] **Step 3: Proxy libera `/api/agent`**

Em `src/proxy.ts`, adicione `"/api/agent"` ao array `PUBLIC_PREFIXES` (fica público para o proxy, mas cada rota chama `exigirAgente`). Resultado:
```ts
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/webhooks", "/api/agent"];
```

- [ ] **Step 4: `.env.example`** — adicione:
```bash
# Token compartilhado entre o access-agent e o backend (header x-agent-token)
AGENT_TOKEN=
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0 erros.
```bash
git add src/lib/access/device-adapter.ts src/lib/agent/auth.ts src/proxy.ts .env.example
git commit -m "feat(agent): interface AccessDeviceAdapter + auth do agente + rota pública token-gated"
```

---

## Task 2: Ingestão no backend (heartbeat, comandos, ack, eventos)

**Files:**
- Create: `src/lib/agent/ingest.ts`
- Test: `src/lib/agent/ingest.test.ts`

- [ ] **Step 1: Teste `src/lib/agent/ingest.test.ts`**

```ts
import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { registrarHeartbeat, entregarComandos, ackComando, ingestarEvento } from "@/lib/agent/ingest";

let deviceId = "";
let personId = "";
let externalUserId = "";

beforeAll(async () => {
  const device = await prisma.accessDevice.findFirstOrThrow();
  deviceId = device.id;
  const m = await prisma.deviceUserMapping.findFirstOrThrow({ where: { deviceId } });
  personId = m.personId;
  externalUserId = m.externalUserId;
});

test("registrarHeartbeat marca device ONLINE + grava heartbeat", async () => {
  await registrarHeartbeat({ deviceId, firmware: "sim-1.0", connectivity: "ok", clockDriftMs: 12 });
  const d = await prisma.accessDevice.findUnique({ where: { id: deviceId } });
  expect(d?.status).toBe("ONLINE");
  const hb = await prisma.deviceHeartbeat.findFirst({ where: { deviceId }, orderBy: { at: "desc" } });
  expect(hb?.firmware).toBe("sim-1.0");
});

test("entregarComandos marca PENDING como DISPATCHED", async () => {
  const cmd = await prisma.deviceCommand.create({ data: { deviceId, personId, type: "ENABLE", dedupeKey: `ing-${Date.now()}` } });
  const entregues = await entregarComandos(deviceId);
  expect(entregues.some((c) => c.id === cmd.id)).toBe(true);
  const after = await prisma.deviceCommand.findUnique({ where: { id: cmd.id } });
  expect(after?.status).toBe("DISPATCHED");
});

test("ackComando SUCCEEDED marca comando e sincroniza mapping", async () => {
  const cmd = await prisma.deviceCommand.create({ data: { deviceId, personId, type: "UPSERT_USER", dedupeKey: `ing2-${Date.now()}`, status: "DISPATCHED" } });
  await ackComando({ commandId: cmd.id, status: "SUCCEEDED" });
  const after = await prisma.deviceCommand.findUnique({ where: { id: cmd.id } });
  expect(after?.status).toBe("SUCCEEDED");
  const m = await prisma.deviceUserMapping.findFirst({ where: { deviceId, personId } });
  expect(m?.syncStatus).toBe("IN_SYNC");
});

test("ingestarEvento cria AccessEvent (dedupe) e atualiza ultimaPresenca", async () => {
  const r1 = await ingestarEvento({
    deviceId, deviceEventId: "sim-evt-1", externalUserId,
    deviceTime: new Date().toISOString(), direction: "ENTRY",
    decision: "ALLOWED", reason: "OK", physicallyPassed: true, mode: "ONLINE",
  });
  expect(r1.created).toBe(true);
  const r2 = await ingestarEvento({
    deviceId, deviceEventId: "sim-evt-1", externalUserId,
    deviceTime: new Date().toISOString(), direction: "ENTRY",
    decision: "ALLOWED", reason: "OK", physicallyPassed: true, mode: "ONLINE",
  });
  expect(r2.created).toBe(false); // dedupe
  const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" } });
  expect(m?.ultimaPresenca).toBeTruthy();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run db:seed && npm test -- src/lib/agent/ingest.test.ts`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementar `src/lib/agent/ingest.ts`**

```ts
import { prisma } from "@/lib/db";
import type { DeviceCommand } from "@prisma/client";

export async function registrarHeartbeat(input: {
  deviceId: string; firmware?: string; connectivity?: string; clockDriftMs?: number;
}): Promise<void> {
  await prisma.$transaction([
    prisma.deviceHeartbeat.create({
      data: { deviceId: input.deviceId, firmware: input.firmware ?? null, connectivity: input.connectivity ?? null, clockDriftMs: input.clockDriftMs ?? null },
    }),
    prisma.accessDevice.update({
      where: { id: input.deviceId },
      data: { status: "ONLINE", lastHeartbeatAt: new Date(), firmware: input.firmware ?? undefined },
    }),
  ]);
}

export async function entregarComandos(deviceId: string): Promise<DeviceCommand[]> {
  const pendentes = await prisma.deviceCommand.findMany({
    where: { deviceId, status: "PENDING" }, orderBy: { createdAt: "asc" },
  });
  if (pendentes.length > 0) {
    await prisma.deviceCommand.updateMany({
      where: { id: { in: pendentes.map((c) => c.id) } },
      data: { status: "DISPATCHED", dispatchedAt: new Date() },
    });
  }
  return pendentes;
}

export async function ackComando(input: {
  commandId: string; status: "SUCCEEDED" | "FAILED"; error?: string;
}): Promise<void> {
  const cmd = await prisma.deviceCommand.findUnique({ where: { id: input.commandId } });
  if (!cmd) return;
  await prisma.deviceCommand.update({
    where: { id: cmd.id },
    data: { status: input.status, ackAt: new Date(), lastError: input.error ?? null },
  });
  // Sincroniza o mapping quando o comando de provisionamento deu certo.
  if (input.status === "SUCCEEDED" && cmd.personId &&
      ["UPSERT_USER", "ENABLE", "SYNC_RULES"].includes(cmd.type)) {
    await prisma.deviceUserMapping.updateMany({
      where: { deviceId: cmd.deviceId, personId: cmd.personId },
      data: { syncStatus: "IN_SYNC", lastSyncAt: new Date() },
    });
  }
}

export async function ingestarEvento(input: {
  deviceId: string; deviceEventId: string; externalUserId?: string;
  deviceTime: string; direction: "ENTRY" | "EXIT";
  decision: "ALLOWED" | "DENIED"; reason?: string; physicallyPassed: boolean;
  mode: "ONLINE" | "OFFLINE" | "CONTINGENCY"; cursor?: string;
}): Promise<{ created: boolean }> {
  // Resolve a pessoa pelo mapping (externalUserId → personId).
  let personId: string | null = null;
  if (input.externalUserId) {
    const m = await prisma.deviceUserMapping.findUnique({
      where: { deviceId_externalUserId: { deviceId: input.deviceId, externalUserId: input.externalUserId } },
    });
    personId = m?.personId ?? null;
  }
  const device = await prisma.accessDevice.findUnique({ where: { id: input.deviceId } });

  try {
    await prisma.accessEvent.create({
      data: {
        deviceId: input.deviceId, deviceEventId: input.deviceEventId, personId,
        unitId: device?.unitId ?? "", deviceTime: new Date(input.deviceTime),
        direction: input.direction, decision: input.decision, reason: input.reason ?? null,
        physicallyPassed: input.physicallyPassed, mode: input.mode, deviceCursor: input.cursor ?? null,
      },
    });
  } catch (e) {
    // colisão de unique (deviceId, deviceEventId) = evento duplicado
    const { Prisma } = await import("@prisma/client");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { created: false };
    }
    throw e;
  }

  // Presença real: só giro autorizado e concluído atualiza ultimaPresenca.
  if (personId && input.decision === "ALLOWED" && input.physicallyPassed && input.direction === "ENTRY") {
    const m = await prisma.membership.findFirst({ where: { personId }, orderBy: { matriculadoEm: "desc" } });
    if (m) await prisma.membership.update({ where: { id: m.id }, data: { ultimaPresenca: new Date(input.deviceTime) } });
  }
  return { created: true };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run db:seed && npm test -- src/lib/agent/ingest.test.ts`
Expected: PASS (4 testes). Reseed depois.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/ingest.ts src/lib/agent/ingest.test.ts
git commit -m "feat(agent): ingestão backend (heartbeat, entrega de comandos, ack+sync, evento+presença)"
```

---

## Task 3: Rotas da API do agente

**Files:**
- Create: `src/app/api/agent/heartbeat/route.ts`, `src/app/api/agent/commands/route.ts`, `src/app/api/agent/commands/ack/route.ts`, `src/app/api/agent/events/route.ts`

- [ ] **Step 1: `heartbeat/route.ts`**

```ts
import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { registrarHeartbeat } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as { deviceId?: string; firmware?: string; connectivity?: string; clockDriftMs?: number };
  if (!body.deviceId) return NextResponse.json({ erro: "deviceId obrigatório" }, { status: 400 });
  await registrarHeartbeat(body as { deviceId: string });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `commands/route.ts`** (GET com deviceId)

```ts
import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { entregarComandos } from "@/lib/agent/ingest";

export async function GET(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const deviceId = new URL(req.url).searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ erro: "deviceId obrigatório" }, { status: 400 });
  const cmds = await entregarComandos(deviceId);
  return NextResponse.json(cmds.map((c) => ({ id: c.id, type: c.type, payload: c.payload })));
}
```

- [ ] **Step 3: `commands/ack/route.ts`**

```ts
import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { ackComando } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as { commandId?: string; status?: "SUCCEEDED" | "FAILED"; error?: string };
  if (!body.commandId || (body.status !== "SUCCEEDED" && body.status !== "FAILED")) {
    return NextResponse.json({ erro: "commandId e status (SUCCEEDED|FAILED) obrigatórios" }, { status: 400 });
  }
  await ackComando({ commandId: body.commandId, status: body.status, error: body.error });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: `events/route.ts`**

```ts
import { NextResponse } from "next/server";
import { exigirAgente } from "@/lib/agent/auth";
import { ingestarEvento } from "@/lib/agent/ingest";

export async function POST(req: Request) {
  const erro = exigirAgente(req);
  if (erro) return erro;
  const body = (await req.json()) as Parameters<typeof ingestarEvento>[0];
  if (!body?.deviceId || !body?.deviceEventId) {
    return NextResponse.json({ erro: "deviceId e deviceEventId obrigatórios" }, { status: 400 });
  }
  const r = await ingestarEvento(body);
  return NextResponse.json(r);
}
```

- [ ] **Step 5: Typecheck + teste via curl**

Run: `npx tsc --noEmit` → 0. Suba o dev server (`npm run db:seed`, `npm run dev`, detecte a porta). Sem `AGENT_TOKEN` no ambiente, `exigirAgente` libera (dev). Descubra o `deviceId`:
```bash
DID=$(docker compose exec -T db psql -U coliseu -d coliseu -t -c "select id from \"AccessDevice\" limit 1;" | tr -d ' \r\n')
B=http://localhost:3000
curl -s -X POST $B/api/agent/heartbeat -H "Content-Type: application/json" -d "{\"deviceId\":\"$DID\",\"firmware\":\"sim-1.0\"}"; echo
curl -s "$B/api/agent/commands?deviceId=$DID"; echo
```
Expected: heartbeat `{"ok":true}`; commands `[]` (nenhum pendente após seed). Reseed depois.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/agent"
git commit -m "feat(agent): rotas /api/agent (heartbeat, commands pull, ack, events)"
```

---

## Task 4: Serviço access-agent (Node/TS) + FakeDeviceAdapter

**Files:**
- Create: `access-agent/package.json`, `access-agent/tsconfig.json`, `access-agent/src/adapters/fake-device.ts`, `access-agent/src/backend-client.ts`, `access-agent/src/agent.ts`, `access-agent/README.md`

- [ ] **Step 1: `access-agent/package.json`**

```json
{
  "name": "coliseu-access-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/agent.ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "tsx": "^4.23.0",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: `access-agent/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `access-agent/src/adapters/fake-device.ts`**

Adapter simulado: mantém um set de usuários habilitados e gera giros sintéticos para eles.
```ts
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
```

- [ ] **Step 4: `access-agent/src/backend-client.ts`**

```ts
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
```

- [ ] **Step 5: `access-agent/src/agent.ts`** (loop principal)

```ts
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
// bootstrap: habilita no fake os usuários já sincronizados virá via comandos; para o demo,
// o primeiro tick já processa comandos pendentes. Para gerar giros de imediato, o agente
// habilita ninguém até receber ENABLE/UPSERT — o seed cria mapeamentos IN_SYNC mas sem comando,
// então o operador pode disparar uma matrícula/pagamento para gerar ENABLE, ou usar SEED_ENABLE.
if (process.env.SEED_ENABLE) {
  for (const id of process.env.SEED_ENABLE.split(",")) void device.enableUser(id.trim());
}
setInterval(() => void tick(), INTERVALO);
void tick();
```

- [ ] **Step 6: `access-agent/README.md`**

Documente: pré-requisitos (backend rodando, `AccessDevice` semeado), variáveis (`BACKEND_URL`, `AGENT_TOKEN`, `DEVICE_ID`, `SEED_ENABLE`, `INTERVALO_MS`), como rodar (`npm i && npm start`), e que é um simulador (o driver real do Control iD entra na Fase 5, trocando só `adapters/`).

- [ ] **Step 7: Typecheck do agente**

Run:
```bash
cd access-agent && npm install && npm run typecheck && cd ..
```
Expected: instala e typecheck 0 erros.

- [ ] **Step 8: Commit**

```bash
git add access-agent
git commit -m "feat(agent): serviço access-agent (Node/TS) com FakeDeviceAdapter e loop heartbeat/comandos/eventos"
```

---

## Task 5: Verificação end-to-end (agente ↔ backend ↔ dashboard)

- [ ] **Step 1: Preparar**

Run: `docker compose up -d db && npm run db:seed`. Suba o backend: `npm run dev` (porta 3000). Pegue o deviceId e os externalUserId sincronizados:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "select d.id as device, m.\"externalUserId\" from \"AccessDevice\" d join \"DeviceUserMapping\" m on m.\"deviceId\"=d.id;"
```

- [ ] **Step 2: Gerar um comando ENABLE real**

Dispare um `PAYMENT_RECEIVED` para um aluno mapeado inadimplente→pago, OU crie um override ALLOW via API autenticada, para o outbox enfileirar um comando. Verifique um `DeviceCommand` PENDING:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "select type, status from \"DeviceCommand\" where status='PENDING';"
```

- [ ] **Step 3: Rodar o agente por alguns ciclos**

Run (troque `<DEVICE_ID>` e os externalUserId do Step 1):
```bash
cd access-agent
DEVICE_ID=<DEVICE_ID> BACKEND_URL=http://localhost:3000 SEED_ENABLE=1001,1002,1003 INTERVALO_MS=2000 timeout 8 npm start; cd ..
```
Expected: logs `[agent] comando ... ok` (consumiu o PENDING) e `[agent] giro simulado de ...`.

- [ ] **Step 4: Confirmar os efeitos no backend**

Run:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "select status, count(*) from \"DeviceCommand\" group by status; select count(*) from \"AccessEvent\"; select \"lastHeartbeatAt\" is not null as tem_hb from \"AccessDevice\" limit 1;"
```
Expected: comando(s) viraram `SUCCEEDED`; há `AccessEvent`s; device tem heartbeat.

- [ ] **Step 5: Dashboard + retenção**

Abra `/acesso` (logado): a Catraca Principal ONLINE com heartbeat recente, e "Acessos recentes" com os giros simulados. Abra `/retencao`: a `ultimaPresenca` dos alunos que giraram deve refletir hoje (presença real vinda do agente).

- [ ] **Step 6: Reseed final** (`npm run db:seed`) para deixar o banco limpo.

---

## Task 6: Verificação final da Fase 4

- [ ] **Step 1: Testes + typecheck + build**

Run: `npm run db:seed && npm test && npx tsc --noEmit && npm run build`
Expected: todos os testes verdes (incl. `ingest.test`); 0 erros; build com as rotas `/api/agent/*`.

- [ ] **Step 2: Typecheck do agente**

Run: `cd access-agent && npm run typecheck && cd ..`
Expected: 0 erros.

---

## Cobertura do spec (self-review) — Fase 4

| Requisito do spec (§10, §15 Fase 4) | Task |
|---|---|
| Protocolo backend↔agente (heartbeat, pull comandos, push eventos) | 2, 3 |
| Interface AccessDeviceAdapter independente de fabricante | 1 |
| FakeDeviceAdapter (simulador) | 4 |
| Agente executa comandos pendentes + ack | 2 (ack+sync), 4 (loop) |
| Detecção de giro concluído → AccessEvent + presença | 2 (ingestarEvento), 5 |
| Heartbeat + estado do device | 2, 3, 5 |
| Fila local / funciona sem hardware | 4 (adapter fake, sem I/O real) |
| Não aceitar conexão pública não autenticada | 1 (token x-agent-token) |
| Dashboard reflete comandos/eventos/heartbeat | 5 (verificação) |

**Fora de escopo (Fase 5+):** driver real do Control iD iDFace (troca só `access-agent/src/adapters/`), enrollment facial real, modo online real-time do device, mTLS agente↔backend (por ora token compartilhado). O agente é simulado; nenhum I/O com hardware.

**Notas de risco:**
- A ingestão de comando (entregarComandos marca DISPATCHED antes do ack) — se o agente cair após pull e antes do ack, o comando fica DISPATCHED; um reaper que volta DISPATCHED antigos para PENDING pode ser adicionado (fora do escopo).
- `AGENT_TOKEN` vazio libera em dev (como o webhook) — em produção `exigirAgente` exige o token.
- O `unitId` do AccessEvent vem do device; garantido não-vazio porque o device é semeado numa unidade.
