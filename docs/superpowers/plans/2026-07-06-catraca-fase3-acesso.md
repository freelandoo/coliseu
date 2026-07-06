# Catraca — Fase 3 (Domínio de acesso) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduzir o domínio de controle de acesso — entidades, estados separados, a função central de decisão `evaluateAccessEligibility`, o outbox de comandos para dispositivos, `AuditLog`, e a área administrativa `/acesso` — tudo software puro e testável, sem depender ainda do hardware (o driver real é Fase 5).

**Architecture:** Entidades de acesso em Postgres/Prisma referenciando `Person`/`Membership`/`Unit`. A elegibilidade de acesso é uma **função pura** `evaluateAccessEligibility(context): AccessDecision` (sem I/O, cobertura de testes alta). Um **outbox** transforma mudanças (financeiras, manuais) em `DeviceCommand` idempotentes com estado próprio. Toda ação sensível grava `AuditLog`. A `/acesso` é um dashboard (Server Components) que lê o estado + ações via rotas `/api` protegidas por RBAC. Nenhum I/O com dispositivo real nesta fase (o agente simulado consome os comandos na Fase 4).

**Tech Stack:** Next.js 16, Prisma 6 + PostgreSQL, Vitest, TypeScript. Sem deps novas.

**Contexto (Fases 1-2 concluídas — ler antes):**
- Postgres via `docker compose up -d db`; Prisma 6; `src/lib/db.ts` → `prisma`; seed idempotente `npm run db:seed`.
- Vitest **sequencial** (`vitest.config.ts` já tem `fileParallelism:false`); reseed antes de testes que mutam.
- Auth: `src/lib/auth/api-guard.ts` (`exigirSessaoApi`), `src/lib/auth/rbac.ts` (`podePapel(role, exigidos)`, `requireUser`, `requireRole`, tipo `Papel`). Layout `(app)` protegido.
- Domínio: `Person`, `Membership` (status `MembershipStatus`), `Plan`, `Unit`, `Cobranca`, `Payment`. Tipos em `src/lib/types.ts`.
- Financeiro: `src/lib/billing/processor.ts` aplica eventos; `src/lib/billing/apply.ts` (`sincronizarCobrancaMembership`). É aqui que o outbox de acesso engancha.
- UI: primitivos `Card`, `Badge`, `Stat`, `PageHeader` em `src/components/ui/primitives.tsx`; `Reveal` (GSAP) em `src/components/ui/Reveal.tsx`; sidebar `src/components/Sidebar.tsx`; paleta industrial (classes `border-border`, `bg-surface`, `text-ink`, `red`, etc.).
- **Não** ler/expor `.env`/`.env.local`. Migrações aditivas (`migrate dev`); **pare o dev server antes de `prisma generate`/`migrate`** (ele trava a DLL do engine no Windows).

**Decisões desta fase (do spec §5-7):**
- Carência (`graceDays`) default **5**; **1 acesso de cortesia** por matrícula (`Membership.courtesyEntriesLeft`, já existe); credencial face+cartão/PIN; unidade única (schema multi-ready).
- `AccessStatus` é **derivado** pela política a partir de Membership/Billing/override/sync — não é um campo persistido de verdade nesta fase (persistimos só o necessário: credenciais, mapeamentos, overrides, eventos, comandos). Isso evita duplicar fonte de verdade.

---

## Estrutura de arquivos (Fase 3)

**Novos:**
- `prisma/schema.prisma` (+ migração) — entidades e enums de acesso.
- `src/lib/access/types.ts` — tipos `AccessDecision`, `AccessReason`, `AccessContext`.
- `src/lib/access/policy.ts` — `evaluateAccessEligibility` (pura).
- `src/lib/access/audit.ts` — `registrarAudit`.
- `src/lib/access/outbox.ts` — `recalcularAcessoDeMembership` → cria `DeviceCommand`.
- `src/lib/repositories/access.ts` — CRUD de device/credential/mapping/override/event/command.
- `src/app/api/acesso/override/route.ts` — liberação/bloqueio manual (RECEPCAO/ADMIN).
- `src/app/api/acesso/credencial/[id]/revoke/route.ts` — revoga credencial (ADMIN).
- `src/app/(app)/acesso/page.tsx` + `src/components/acesso/*` — dashboard.
- Testes: `src/lib/access/*.test.ts`, `src/lib/repositories/access.test.ts`.

**Alterados:**
- `src/components/Sidebar.tsx` — item de menu "Acesso".
- `src/lib/billing/processor.ts` — após sincronizar Cobrança/Membership, chamar o outbox (recalcular acesso → comando).
- `prisma/seed.ts` — semear 1 `AccessDevice` e algumas credenciais/mapeamentos de exemplo.

---

## Task 1: Schema do domínio de acesso

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1: Parar o dev server (evita lock da DLL)**

Run: `taskkill //F //IM node.exe //T 2>/dev/null; echo ok` (Windows Git Bash). Depois suba só o db: `docker compose up -d db`.

- [ ] **Step 2: Adicionar enums e models ao final de `prisma/schema.prisma`** (não remova nada)

```prisma
enum EnrollmentStatus {
  NOT_STARTED
  IN_PROGRESS
  ENROLLED
  FAILED
  REVOKED
}

enum DeviceSyncStatus {
  IN_SYNC
  PENDING
  ERROR
}

enum DeviceCommandStatus {
  PENDING
  DISPATCHED
  ACKNOWLEDGED
  SUCCEEDED
  FAILED
  DEAD_LETTER
}

enum CredentialType {
  FACE
  CARD
  PIN
}

enum AccessDeviceStatus {
  ONLINE
  OFFLINE
  MAINTENANCE
}

enum OverrideAction {
  ALLOW
  BLOCK
}

model AccessDevice {
  id              String             @id @default(cuid())
  unit            Unit               @relation(fields: [unitId], references: [id])
  unitId          String
  name            String
  lanHost         String?
  lanPort         Int?
  firmware        String?
  mode            String             @default("HYBRID")
  status          AccessDeviceStatus @default(OFFLINE)
  lastHeartbeatAt DateTime?
  agentId         String?
  createdAt       DateTime           @default(now())

  mappings   DeviceUserMapping[]
  commands   DeviceCommand[]
  heartbeats DeviceHeartbeat[]
  events     AccessEvent[]

  @@unique([unitId, name])
  @@index([unitId, status])
}

model AccessCredential {
  id         String           @id @default(cuid())
  person     Person           @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId   String
  type       CredentialType
  status     EnrollmentStatus @default(NOT_STARTED)
  deviceRef  String?          // id no dispositivo (NUNCA template bruto)
  enrolledAt DateTime?
  revokedAt  DateTime?
  createdAt  DateTime         @default(now())

  @@index([personId, type])
}

model DeviceUserMapping {
  id             String           @id @default(cuid())
  device         AccessDevice     @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  deviceId       String
  person         Person           @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId       String
  externalUserId String
  syncStatus     DeviceSyncStatus @default(PENDING)
  lastSyncAt     DateTime?

  @@unique([deviceId, externalUserId])
  @@unique([deviceId, personId])
  @@index([syncStatus])
}

model AccessPolicy {
  id              String   @id @default(cuid())
  unit            Unit     @relation(fields: [unitId], references: [id])
  unitId          String
  plan            Plan?    @relation(fields: [planId], references: [id])
  planId          String?
  graceDays       Int      @default(5)
  maxEntriesPerDay Int?
  timeZones       Json?    // janelas de horário (livre)
  createdAt       DateTime @default(now())

  @@index([unitId, planId])
}

model AccessEvent {
  id               String   @id @default(cuid())
  device           AccessDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  deviceId         String
  person           Person?  @relation(fields: [personId], references: [id], onDelete: SetNull)
  personId         String?
  unitId           String
  deviceEventId    String?
  deviceTime       DateTime
  serverTime       DateTime @default(now())
  direction        String   @default("ENTRY")
  credentialType   String?
  decision         String   // ALLOWED | DENIED
  reason           String?
  physicallyPassed Boolean  @default(false)
  mode             String   @default("ONLINE")
  deviceCursor     String?

  @@unique([deviceId, deviceEventId])
  @@index([personId, deviceTime])
  @@index([unitId, serverTime])
}

model DeviceCommand {
  id           String              @id @default(cuid())
  device       AccessDevice        @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  deviceId     String
  type         String              // UPSERT_USER | ENABLE | DISABLE | REMOVE_USER | ENROLL | OPEN | SYNC_RULES
  payload      Json?
  status       DeviceCommandStatus @default(PENDING)
  attempts     Int                 @default(0)
  dedupeKey    String              @unique
  lastError    String?
  dispatchedAt DateTime?
  ackAt        DateTime?
  createdAt    DateTime            @default(now())

  @@index([status, deviceId])
}

model DeviceHeartbeat {
  id           String       @id @default(cuid())
  device       AccessDevice @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  deviceId     String
  at           DateTime     @default(now())
  firmware     String?
  connectivity String?
  clockDriftMs Int?

  @@index([deviceId, at])
}

model EnrollmentSession {
  id        String           @id @default(cuid())
  person    Person           @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId  String
  deviceId  String?
  type      CredentialType   @default(FACE)
  status    EnrollmentStatus @default(IN_PROGRESS)
  startedAt DateTime         @default(now())
  resultAt  DateTime?

  @@index([status])
}

model ManualAccessOverride {
  id             String        @id @default(cuid())
  person         Person        @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId       String
  action         OverrideAction
  reason         String
  expiresAt      DateTime?
  createdByUserId String?
  createdAt      DateTime      @default(now())

  @@index([personId, expiresAt])
}

model AuditLog {
  id        String   @id @default(cuid())
  actorType String   // USER | AGENT | SYSTEM | WEBHOOK
  actorId   String?
  action    String
  entity    String
  entityId  String?
  before    Json?
  after     Json?
  ip        String?
  at        DateTime @default(now())

  @@index([entity, entityId, at])
}
```

- [ ] **Step 3: Adicionar relações reversas em `Person` e `Unit` e `Plan`**

No model `Person` adicione:
```prisma
  credentials      AccessCredential[]
  deviceMappings   DeviceUserMapping[]
  accessEvents     AccessEvent[]
  enrollments      EnrollmentSession[]
  overrides        ManualAccessOverride[]
```
No model `Unit` adicione:
```prisma
  devices    AccessDevice[]
  policies   AccessPolicy[]
```
No model `Plan` adicione:
```prisma
  accessPolicies AccessPolicy[]
```

- [ ] **Step 4: Migração**

Run: `npx prisma migrate dev --name fase3_acesso`
Expected: cria a migração e gera o client (aditivo). Verifique:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "\dt" | grep -E "AccessDevice|AccessCredential|DeviceUserMapping|AccessEvent|DeviceCommand|AuditLog|ManualAccessOverride|EnrollmentSession|DeviceHeartbeat|AccessPolicy"
```
Expected: as 10 tabelas.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): domínio de acesso (device, credential, mapping, event, command, audit, override, policy, heartbeat, enrollment)"
```

---

## Task 2: Tipos e política de acesso (o coração — pura, testável)

**Files:**
- Create: `src/lib/access/types.ts`, `src/lib/access/policy.ts`
- Test: `src/lib/access/policy.test.ts`

- [ ] **Step 1: Tipos `src/lib/access/types.ts`**

```ts
export type AccessStatus =
  | "PENDING_ENROLLMENT"
  | "PENDING_SYNC"
  | "ALLOWED"
  | "GRACE"
  | "DENIED"
  | "MANUAL_OVERRIDE";

export type AccessReason =
  | "OK"
  | "SEM_BIOMETRIA"
  | "AGUARDANDO_SYNC"
  | "AGUARDANDO_PAGAMENTO"
  | "CORTESIA"
  | "EM_CARENCIA"
  | "INADIMPLENTE"
  | "CANCELADO"
  | "EXPIRADO"
  | "SUSPENSO"
  | "OVERRIDE_ALLOW"
  | "OVERRIDE_BLOCK"
  | "FORA_DE_HORARIO";

export interface AccessContext {
  membershipStatus: "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELED" | "EXPIRED" | null;
  billingStatus: "PENDING" | "PAID" | "OVERDUE" | "REFUNDED" | "CHARGEBACK" | "CANCELED" | null;
  diasAtraso: number;        // dias desde o vencimento (>0 = vencido). 0/neg = em dia
  graceDays: number;         // carência configurada (default 5)
  courtesyEntriesLeft: number;
  temCredencialEnrolled: boolean;
  sincronizado: boolean;     // pelo menos um DeviceUserMapping IN_SYNC
  overrideAtivo: "ALLOW" | "BLOCK" | null;
  agora: Date;
}

export interface AccessDecision {
  allow: boolean;
  status: AccessStatus;
  reason: AccessReason;
  consumirCortesia: boolean; // true quando a liberação usa 1 crédito de cortesia
}
```

- [ ] **Step 2: Teste `src/lib/access/policy.test.ts`**

```ts
import { expect, test } from "vitest";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import type { AccessContext } from "@/lib/access/types";

const base: AccessContext = {
  membershipStatus: "ACTIVE", billingStatus: "PAID", diasAtraso: 0, graceDays: 5,
  courtesyEntriesLeft: 1, temCredencialEnrolled: true, sincronizado: true,
  overrideAtivo: null, agora: new Date("2026-07-06T10:00:00Z"),
};

test("ativo + pago + sincronizado → ALLOWED", () => {
  const d = evaluateAccessEligibility(base);
  expect(d.allow).toBe(true);
  expect(d.status).toBe("ALLOWED");
});

test("sem biometria → DENIED PENDING_ENROLLMENT", () => {
  const d = evaluateAccessEligibility({ ...base, temCredencialEnrolled: false });
  expect(d.allow).toBe(false);
  expect(d.status).toBe("PENDING_ENROLLMENT");
});

test("enrolled mas não sincronizado → PENDING_SYNC (nega)", () => {
  const d = evaluateAccessEligibility({ ...base, sincronizado: false });
  expect(d.allow).toBe(false);
  expect(d.status).toBe("PENDING_SYNC");
});

test("aguardando 1º pagamento com cortesia → ALLOWED consumindo cortesia", () => {
  const d = evaluateAccessEligibility({ ...base, membershipStatus: "PENDING_PAYMENT", billingStatus: "PENDING", courtesyEntriesLeft: 1 });
  expect(d.allow).toBe(true);
  expect(d.reason).toBe("CORTESIA");
  expect(d.consumirCortesia).toBe(true);
});

test("aguardando pagamento sem cortesia → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, membershipStatus: "PENDING_PAYMENT", billingStatus: "PENDING", courtesyEntriesLeft: 0 });
  expect(d.allow).toBe(false);
  expect(d.reason).toBe("AGUARDANDO_PAGAMENTO");
});

test("vencido dentro da carência → GRACE (libera)", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "OVERDUE", diasAtraso: 3, graceDays: 5 });
  expect(d.allow).toBe(true);
  expect(d.status).toBe("GRACE");
});

test("vencido além da carência → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "OVERDUE", diasAtraso: 6, graceDays: 5 });
  expect(d.allow).toBe(false);
  expect(d.reason).toBe("INADIMPLENTE");
});

test("cancelado → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, membershipStatus: "CANCELED" });
  expect(d.allow).toBe(false);
  expect(d.reason).toBe("CANCELADO");
});

test("chargeback → DENIED", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "CHARGEBACK" });
  expect(d.allow).toBe(false);
});

test("override BLOCK vence tudo", () => {
  const d = evaluateAccessEligibility({ ...base, overrideAtivo: "BLOCK" });
  expect(d.allow).toBe(false);
  expect(d.status).toBe("MANUAL_OVERRIDE");
});

test("override ALLOW libera mesmo inadimplente", () => {
  const d = evaluateAccessEligibility({ ...base, billingStatus: "OVERDUE", diasAtraso: 30, overrideAtivo: "ALLOW" });
  expect(d.allow).toBe(true);
  expect(d.status).toBe("MANUAL_OVERRIDE");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- src/lib/access/policy.test.ts`
Expected: FALHA.

- [ ] **Step 4: Implementar `src/lib/access/policy.ts`**

```ts
import type { AccessContext, AccessDecision } from "@/lib/access/types";

/**
 * Decisão central de acesso — função PURA (sem I/O).
 * Ordem de precedência: override manual > credencial/sync > contrato/financeiro.
 */
export function evaluateAccessEligibility(ctx: AccessContext): AccessDecision {
  // 1) Override manual vence tudo.
  if (ctx.overrideAtivo === "BLOCK") {
    return { allow: false, status: "MANUAL_OVERRIDE", reason: "OVERRIDE_BLOCK", consumirCortesia: false };
  }
  if (ctx.overrideAtivo === "ALLOW") {
    return { allow: true, status: "MANUAL_OVERRIDE", reason: "OVERRIDE_ALLOW", consumirCortesia: false };
  }

  // 2) Precisa de credencial cadastrada e sincronizada para girar.
  if (!ctx.temCredencialEnrolled) {
    return { allow: false, status: "PENDING_ENROLLMENT", reason: "SEM_BIOMETRIA", consumirCortesia: false };
  }
  if (!ctx.sincronizado) {
    return { allow: false, status: "PENDING_SYNC", reason: "AGUARDANDO_SYNC", consumirCortesia: false };
  }

  // 3) Contrato encerrado/cancelado.
  if (ctx.membershipStatus === "CANCELED") {
    return { allow: false, status: "DENIED", reason: "CANCELADO", consumirCortesia: false };
  }
  if (ctx.membershipStatus === "EXPIRED") {
    return { allow: false, status: "DENIED", reason: "EXPIRADO", consumirCortesia: false };
  }
  if (ctx.membershipStatus === "SUSPENDED" && ctx.billingStatus !== "OVERDUE") {
    return { allow: false, status: "DENIED", reason: "SUSPENSO", consumirCortesia: false };
  }

  // 4) Estorno / chargeback = nega imediato.
  if (ctx.billingStatus === "REFUNDED" || ctx.billingStatus === "CHARGEBACK") {
    return { allow: false, status: "DENIED", reason: "INADIMPLENTE", consumirCortesia: false };
  }

  // 5) Aguardando 1º pagamento → 1 acesso de cortesia.
  if (ctx.membershipStatus === "PENDING_PAYMENT" || ctx.billingStatus === "PENDING") {
    if (ctx.courtesyEntriesLeft > 0) {
      return { allow: true, status: "ALLOWED", reason: "CORTESIA", consumirCortesia: true };
    }
    return { allow: false, status: "DENIED", reason: "AGUARDANDO_PAGAMENTO", consumirCortesia: false };
  }

  // 6) Vencido → carência.
  if (ctx.billingStatus === "OVERDUE") {
    if (ctx.diasAtraso <= ctx.graceDays) {
      return { allow: true, status: "GRACE", reason: "EM_CARENCIA", consumirCortesia: false };
    }
    return { allow: false, status: "DENIED", reason: "INADIMPLENTE", consumirCortesia: false };
  }

  // 7) Em dia e pago.
  if (ctx.membershipStatus === "ACTIVE" && ctx.billingStatus === "PAID") {
    return { allow: true, status: "ALLOWED", reason: "OK", consumirCortesia: false };
  }

  // Fallback conservador.
  return { allow: false, status: "DENIED", reason: "INADIMPLENTE", consumirCortesia: false };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/lib/access/policy.test.ts`
Expected: PASS (todos os cenários).

- [ ] **Step 6: Commit**

```bash
git add src/lib/access/types.ts src/lib/access/policy.ts src/lib/access/policy.test.ts
git commit -m "feat(access): política central evaluateAccessEligibility (pura, coberta por testes)"
```

---

## Task 3: Repositório de acesso + AuditLog

**Files:**
- Create: `src/lib/repositories/access.ts`, `src/lib/access/audit.ts`
- Test: `src/lib/repositories/access.test.ts`

- [ ] **Step 1: Teste**

`src/lib/repositories/access.test.ts`:
```ts
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { criarComando, listarDevices, overridesAtivosDe } from "@/lib/repositories/access";

test("listarDevices devolve o device semente", async () => {
  const ds = await listarDevices();
  expect(ds.length).toBeGreaterThanOrEqual(1);
});

test("criarComando é idempotente por dedupeKey", async () => {
  const device = (await listarDevices())[0];
  const a = await criarComando({ deviceId: device.id, type: "ENABLE", dedupeKey: "t-enable-1", payload: { x: 1 } });
  const b = await criarComando({ deviceId: device.id, type: "ENABLE", dedupeKey: "t-enable-1", payload: { x: 1 } });
  expect(b.id).toBe(a.id); // mesma dedupeKey → não duplica
});

test("overridesAtivosDe filtra por expiração", async () => {
  const p = await prisma.person.findFirstOrThrow();
  await prisma.manualAccessOverride.create({ data: { personId: p.id, action: "ALLOW", reason: "teste", expiresAt: new Date(Date.now() + 3600_000) } });
  const ativos = await overridesAtivosDe(p.id);
  expect(ativos.length).toBeGreaterThanOrEqual(1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/repositories/access.test.ts`
Expected: FALHA (módulo + device semente inexistentes — o device é semeado na Task 6; para este teste, semeie-o aqui ou rode a Task 6 antes; para manter a ordem, o teste usa `listarDevices()[0]` que exige o seed com device — implemente a Task 6 Step de device ANTES de rodar, ou crie um device no `beforeAll`. Para simplicidade, adicione no topo do teste um `beforeAll` que garante um device:).

Adicione ao teste, no topo:
```ts
import { beforeAll } from "vitest";
beforeAll(async () => {
  const unit = await prisma.unit.findFirstOrThrow();
  await prisma.accessDevice.upsert({
    where: { unitId_name: { unitId: unit.id, name: "Catraca Principal" } },
    update: {},
    create: { unitId: unit.id, name: "Catraca Principal", mode: "HYBRID", status: "OFFLINE" },
  });
});
```

- [ ] **Step 3: Implementar `src/lib/repositories/access.ts`**

```ts
import { prisma } from "@/lib/db";
import type { AccessDevice, DeviceCommand, ManualAccessOverride } from "@prisma/client";

export async function listarDevices(): Promise<AccessDevice[]> {
  return prisma.accessDevice.findMany({ orderBy: { name: "asc" } });
}

export async function criarComando(input: {
  deviceId: string; type: string; dedupeKey: string; payload?: unknown;
}): Promise<DeviceCommand> {
  const existing = await prisma.deviceCommand.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing) return existing;
  return prisma.deviceCommand.create({
    data: {
      deviceId: input.deviceId, type: input.type, dedupeKey: input.dedupeKey,
      payload: (input.payload ?? undefined) as never,
    },
  });
}

export async function comandosPendentes(deviceId: string): Promise<DeviceCommand[]> {
  return prisma.deviceCommand.findMany({
    where: { deviceId, status: { in: ["PENDING", "DISPATCHED"] } },
    orderBy: { createdAt: "asc" },
  });
}

export async function overridesAtivosDe(personId: string): Promise<ManualAccessOverride[]> {
  const agora = new Date();
  return prisma.manualAccessOverride.findMany({
    where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: agora } }] },
    orderBy: { createdAt: "desc" },
  });
}

export async function criarOverride(input: {
  personId: string; action: "ALLOW" | "BLOCK"; reason: string; expiresAt?: Date | null; createdByUserId?: string;
}): Promise<ManualAccessOverride> {
  return prisma.manualAccessOverride.create({
    data: {
      personId: input.personId, action: input.action, reason: input.reason,
      expiresAt: input.expiresAt ?? null, createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function revogarCredencial(id: string): Promise<boolean> {
  const c = await prisma.accessCredential.findUnique({ where: { id } });
  if (!c) return false;
  await prisma.accessCredential.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
  return true;
}
```

- [ ] **Step 4: Implementar `src/lib/access/audit.ts`**

```ts
import { prisma } from "@/lib/db";

export async function registrarAudit(input: {
  actorType: "USER" | "AGENT" | "SYSTEM" | "WEBHOOK";
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: input.actorType, actorId: input.actorId ?? null,
      action: input.action, entity: input.entity, entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as never, after: (input.after ?? undefined) as never,
      ip: input.ip ?? null,
    },
  });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/lib/repositories/access.test.ts`
Expected: PASS. Depois `npm run db:seed`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repositories/access.ts src/lib/access/audit.ts src/lib/repositories/access.test.ts
git commit -m "feat(access): repositório de acesso + AuditLog"
```

---

## Task 4: Outbox — recalcular acesso e enfileirar comandos

**Files:**
- Create: `src/lib/access/outbox.ts`
- Modify: `src/lib/billing/processor.ts`
- Test: `src/lib/access/outbox.test.ts`

- [ ] **Step 1: Implementar `src/lib/access/outbox.ts`**

Monta o `AccessContext` de uma pessoa a partir do banco, roda a política e cria comandos ENABLE/DISABLE idempotentes para cada device onde a pessoa está mapeada.

```ts
import { prisma } from "@/lib/db";
import { evaluateAccessEligibility } from "@/lib/access/policy";
import type { AccessContext } from "@/lib/access/types";
import { criarComando } from "@/lib/repositories/access";

/** Reavalia o acesso de uma pessoa e enfileira ENABLE/DISABLE por device mapeado. */
export async function recalcularAcessoDePessoa(personId: string): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { personId }, orderBy: { matriculadoEm: "desc" },
  });
  const payment = await prisma.payment.findFirst({
    where: { subscription: { customer: { personId } } },
    orderBy: { dueDate: "desc" },
  });
  const credEnrolled = await prisma.accessCredential.count({ where: { personId, status: "ENROLLED" } });
  const mappings = await prisma.deviceUserMapping.findMany({ where: { personId } });
  const sincronizado = mappings.some((m) => m.syncStatus === "IN_SYNC");
  const override = await prisma.manualAccessOverride.findFirst({
    where: { personId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: { createdAt: "desc" },
  });

  const agora = new Date();
  const diasAtraso = payment?.dueDate ? Math.floor((agora.getTime() - payment.dueDate.getTime()) / 86_400_000) : 0;

  const ctx: AccessContext = {
    membershipStatus: membership?.status ?? null,
    billingStatus: payment?.status ?? null,
    diasAtraso,
    graceDays: 5,
    courtesyEntriesLeft: membership?.courtesyEntriesLeft ?? 0,
    temCredencialEnrolled: credEnrolled > 0,
    sincronizado,
    overrideAtivo: override ? (override.action as "ALLOW" | "BLOCK") : null,
    agora,
  };

  const decisao = evaluateAccessEligibility(ctx);
  const tipo = decisao.allow ? "ENABLE" : "DISABLE";

  for (const m of mappings) {
    // dedupeKey inclui o status para não recriar comando igual repetido.
    await criarComando({
      deviceId: m.deviceId, type: tipo,
      dedupeKey: `${tipo}:${m.deviceId}:${personId}:${decisao.reason}`,
      payload: { externalUserId: m.externalUserId, reason: decisao.reason },
    });
  }
}
```

- [ ] **Step 2: Teste `src/lib/access/outbox.test.ts`**

```ts
import { expect, test, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";

let deviceId = "";
let personId = "";

beforeAll(async () => {
  const unit = await prisma.unit.findFirstOrThrow();
  const device = await prisma.accessDevice.upsert({
    where: { unitId_name: { unitId: unit.id, name: "Catraca Test Outbox" } },
    update: {}, create: { unitId: unit.id, name: "Catraca Test Outbox" },
  });
  deviceId = device.id;
  const p = await prisma.person.findFirstOrThrow({ where: { fase: "aluno" } });
  personId = p.id;
  // credencial enrolled + mapping in-sync para permitir ALLOW
  await prisma.accessCredential.create({ data: { personId, type: "FACE", status: "ENROLLED", enrolledAt: new Date() } });
  await prisma.deviceUserMapping.upsert({
    where: { deviceId_personId: { deviceId, personId } },
    update: { syncStatus: "IN_SYNC" },
    create: { deviceId, personId, externalUserId: "1001", syncStatus: "IN_SYNC" },
  });
});

test("recalcular acesso de aluno ativo enfileira ENABLE", async () => {
  await recalcularAcessoDePessoa(personId);
  const cmd = await prisma.deviceCommand.findFirst({ where: { deviceId, type: "ENABLE" } });
  expect(cmd).not.toBeNull();
});
```

- [ ] **Step 3: Rodar (fail→pass)**

Run: `npm run db:seed && npm test -- src/lib/access/outbox.test.ts`
Expected: PASS. Depois `npm run db:seed`.

- [ ] **Step 4: Enganchar no processor financeiro**

Em `src/lib/billing/processor.ts`, ao final de `processarEvento` (após a transação, quando `aplicado`), reavalie o acesso da pessoa dona da cobrança. Como o processor já busca a `Cobranca` por `asaasId` dentro da tx para pegar `personId`, capture esse `personId` numa variável fora da tx e, após a tx, chame o outbox:

```ts
// no topo do arquivo:
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
// dentro de processarEvento, declare antes da tx: let afetadoPersonId: string | null = null;
// dentro da tx, quando achar a cobrança: afetadoPersonId = cob.personId;
// depois da tx:
if (afetadoPersonId) {
  try { await recalcularAcessoDePessoa(afetadoPersonId); } catch (e) { console.error("[outbox] falha ao recalcular acesso:", e); }
}
```
Leia o arquivo e aplique com cuidado (não quebre a lógica existente; o recálculo é best-effort fora da transação).

- [ ] **Step 5: Typecheck + testes**

Run: `npm run db:seed && npx tsc --noEmit && npm test`
Expected: 0 erros; todos os testes verdes (incluindo processor e outbox).

- [ ] **Step 6: Commit**

```bash
git add src/lib/access/outbox.ts src/lib/access/outbox.test.ts src/lib/billing/processor.ts
git commit -m "feat(access): outbox — evento financeiro recalcula acesso e enfileira ENABLE/DISABLE"
```

---

## Task 5: API — override manual e revogação de credencial

**Files:**
- Create: `src/app/api/acesso/override/route.ts`, `src/app/api/acesso/credencial/[id]/revoke/route.ts`

- [ ] **Step 1: Rota de override (RECEPCAO/ADMIN)**

`src/app/api/acesso/override/route.ts`:
```ts
import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { criarOverride } from "@/lib/repositories/access";
import { recalcularAcessoDePessoa } from "@/lib/access/outbox";
import { registrarAudit } from "@/lib/access/audit";

export async function POST(req: Request) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!g.user || !podePapel(g.user.role as Papel, ["RECEPCAO", "ADMIN"])) {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }
  const body = (await req.json()) as { personId?: string; action?: "ALLOW" | "BLOCK"; reason?: string; minutos?: number };
  if (!body.personId || (body.action !== "ALLOW" && body.action !== "BLOCK") || !body.reason?.trim()) {
    return NextResponse.json({ erro: "personId, action (ALLOW|BLOCK) e reason são obrigatórios" }, { status: 400 });
  }
  const expiresAt = body.minutos ? new Date(Date.now() + body.minutos * 60_000) : null;
  const ov = await criarOverride({ personId: body.personId, action: body.action, reason: body.reason, expiresAt, createdByUserId: g.user.id });
  await recalcularAcessoDePessoa(body.personId);
  await registrarAudit({ actorType: "USER", actorId: g.user.id, action: `OVERRIDE_${body.action}`, entity: "Person", entityId: body.personId, after: { reason: body.reason, expiresAt } });
  return NextResponse.json(ov, { status: 201 });
}
```

- [ ] **Step 2: Rota de revogação (ADMIN)**

`src/app/api/acesso/credencial/[id]/revoke/route.ts`:
```ts
import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { revogarCredencial } from "@/lib/repositories/access";
import { registrarAudit } from "@/lib/access/audit";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!g.user || !podePapel(g.user.role as Papel, ["ADMIN"])) {
    return NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 });
  }
  const { id } = await params;
  const ok = await revogarCredencial(id);
  if (!ok) return NextResponse.json({ erro: "credencial não encontrada" }, { status: 404 });
  await registrarAudit({ actorType: "USER", actorId: g.user.id, action: "REVOKE_CREDENTIAL", entity: "AccessCredential", entityId: id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + teste via curl**

Run: `npx tsc --noEmit` (0 erros). Com dev server + login ADMIN (cookie em /tmp/cj.txt), pegue um personId (`curl -s -b /tmp/cj.txt $B/api/pessoas | ...`) e:
```bash
curl -s -b /tmp/cj.txt -X POST $B/api/acesso/override -H "Content-Type: application/json" -d '{"personId":"<ID>","action":"BLOCK","reason":"teste","minutos":60}'; echo
```
Expected: 201 com o override; sem login → 401; papel insuficiente → 403.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/acesso"
git commit -m "feat(access): API de override manual (recepção) e revogação de credencial (admin)"
```

---

## Task 6: Seed do device + dashboard /acesso

**Files:**
- Modify: `prisma/seed.ts`, `src/components/Sidebar.tsx`
- Create: `src/app/(app)/acesso/page.tsx`, `src/components/acesso/AcessoDashboard.tsx`

- [ ] **Step 1: Semear 1 device + credenciais/mapeamentos de exemplo**

No `prisma/seed.ts`: adicione as tabelas de acesso ao bloco de limpeza (topo, ordem FK-safe: deviceCommand, deviceHeartbeat, accessEvent, deviceUserMapping, accessCredential, enrollmentSession, manualAccessOverride, accessPolicy, accessDevice, auditLog — todas `deleteMany`). Ao final do `main()`, crie 1 `AccessDevice` "Catraca Principal" na unidade, e para 3 alunos ACTIVE crie `AccessCredential` FACE ENROLLED + `DeviceUserMapping` IN_SYNC (externalUserId sequencial). Código:
```ts
  const device = await prisma.accessDevice.create({
    data: { unitId: unit.id, name: "Catraca Principal", mode: "HYBRID", status: "ONLINE", firmware: "sim-1.0", lastHeartbeatAt: new Date() },
  });
  const ativos = await prisma.person.findMany({ where: { fase: "aluno" }, take: 3 });
  let ext = 1000;
  for (const p of ativos) {
    ext += 1;
    await prisma.accessCredential.create({ data: { personId: p.id, type: "FACE", status: "ENROLLED", enrolledAt: new Date() } });
    await prisma.deviceUserMapping.create({ data: { deviceId: device.id, personId: p.id, externalUserId: String(ext), syncStatus: "IN_SYNC", lastSyncAt: new Date() } });
  }
```
Rode `npm run db:seed && npm run db:seed` (idempotente 2x). Verifique 1 device, 3 credenciais.

- [ ] **Step 2: Item de menu "Acesso" no Sidebar**

Leia `src/components/Sidebar.tsx` e adicione um item de navegação para `/acesso` seguindo o padrão dos itens existentes (mesmo componente de link, ícone/emoji coerente, rótulo "Acesso"). Não altere o estilo — só some um item na lista.

- [ ] **Step 3: Dashboard `src/app/(app)/acesso/page.tsx`**

Server Component que carrega o estado e passa ao componente client. Usa `requireUser()` (o layout já protege, mas reforça) e `force-dynamic`:
```tsx
import { Reveal } from "@/components/ui/Reveal";
import { PageHeader, Stat } from "@/components/ui/primitives";
import { AcessoDashboard } from "@/components/acesso/AcessoDashboard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AcessoPage() {
  const [devices, pendentesBio, pendentesSync, comandos, eventos] = await Promise.all([
    prisma.accessDevice.findMany({ orderBy: { name: "asc" } }),
    prisma.person.count({ where: { fase: "aluno", credentials: { none: { status: "ENROLLED" } } } }),
    prisma.deviceUserMapping.count({ where: { syncStatus: { not: "IN_SYNC" } } }),
    prisma.deviceCommand.findMany({ where: { status: { in: ["PENDING", "DISPATCHED"] } }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.accessEvent.findMany({ take: 20, orderBy: { serverTime: "desc" }, include: { person: { select: { nome: true } } } }),
  ]);
  const dados = {
    devices: devices.map((d) => ({ id: d.id, name: d.name, status: d.status, firmware: d.firmware ?? "—", lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null })),
    pendentesBio, pendentesSync,
    comandos: comandos.map((c) => ({ id: c.id, type: c.type, status: c.status, createdAt: c.createdAt.toISOString() })),
    eventos: eventos.map((e) => ({ id: e.id, nome: e.person?.nome ?? "—", decision: e.decision, reason: e.reason ?? "", deviceTime: e.deviceTime.toISOString(), physicallyPassed: e.physicallyPassed })),
  };
  return (
    <>
      <Reveal>
        <PageHeader step={5} title="Controle de Acesso" subtitle="Catracas, sincronização, comandos pendentes e acessos recentes." />
      </Reveal>
      <Reveal delay={0.05}>
        <AcessoDashboard dados={dados} />
      </Reveal>
    </>
  );
}
```

- [ ] **Step 4: Componente `src/components/acesso/AcessoDashboard.tsx`**

Client component que renderiza os cards de device (online/offline, heartbeat), os stats (pendentes de biometria/sync), a fila de comandos e os acessos recentes — usando `Card`/`Badge`/`Stat` e a paleta atual. Inclua um `formatData` local (ou importe de `@/lib/mock-data`). Estrutura mínima:
```tsx
"use client";
import { Card, Badge, Stat } from "@/components/ui/primitives";

interface Dados {
  devices: { id: string; name: string; status: string; firmware: string; lastHeartbeatAt: string | null }[];
  pendentesBio: number; pendentesSync: number;
  comandos: { id: string; type: string; status: string; createdAt: string }[];
  eventos: { id: string; nome: string; decision: string; reason: string; deviceTime: string; physicallyPassed: boolean }[];
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export function AcessoDashboard({ dados }: { dados: Dados }) {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Catracas" value={dados.devices.length} hint="dispositivos" />
        <Stat label="Online" value={dados.devices.filter((d) => d.status === "ONLINE").length} tone="ok" />
        <Stat label="Pend. biometria" value={dados.pendentesBio} tone="warn" hint="alunos sem face" />
        <Stat label="Pend. sync" value={dados.pendentesSync} tone="warn" hint="mapeamentos" />
      </section>

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">Catracas</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {dados.devices.map((d) => (
            <Card key={d.id} className="flex items-center justify-between p-5">
              <div>
                <p className="font-medium text-ink">{d.name}</p>
                <p className="text-xs text-faint">firmware {d.firmware} · heartbeat {fmt(d.lastHeartbeatAt)}</p>
              </div>
              <Badge tone={d.status === "ONLINE" ? "ok" : d.status === "MAINTENANCE" ? "warn" : "red"}>{d.status}</Badge>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">Comandos pendentes</h2>
        <Card className="overflow-hidden">
          {dados.comandos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-faint">Nenhum comando pendente.</p>
          ) : (
            <div className="divide-y divide-border">
              {dados.comandos.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-ink">{c.type}</span>
                  <Badge tone="neutral">{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">Acessos recentes</h2>
        <Card className="overflow-hidden">
          {dados.eventos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-faint">Nenhum acesso registrado ainda.</p>
          ) : (
            <div className="divide-y divide-border">
              {dados.eventos.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-ink">{e.nome}</p>
                    <p className="text-xs text-faint">{fmt(e.deviceTime)} · {e.reason}</p>
                  </div>
                  <Badge tone={e.decision === "ALLOWED" ? "ok" : "red"}>{e.decision}{e.physicallyPassed ? " ✓" : ""}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + build + verificação visual**

Run: `npx tsc --noEmit && npm run build`. Suba o dev server, faça login, abra `/acesso`: deve mostrar a Catraca Principal ONLINE, stats de pendências, e (por ora) sem comandos/eventos. Confira que o item "Acesso" aparece no menu e que nenhuma outra tela quebrou.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts src/components/Sidebar.tsx "src/app/(app)/acesso" src/components/acesso
git commit -m "feat(acesso): dashboard /acesso (catracas, sync, comandos, acessos) + seed do device"
```

---

## Task 7: Verificação final da Fase 3

- [ ] **Step 1: Testes + typecheck + build**

Run: `npm run db:seed && npm test && npx tsc --noEmit && npm run build`
Expected: todos os testes verdes (política + repos + outbox + billing + auth); 0 erros; build OK com a rota `/acesso` e as `/api/acesso/*`.

- [ ] **Step 2: Smoke do fluxo financeiro→acesso**

Com dev server + `npm run db:seed`:
1. Confirme que 3 alunos têm credencial+mapping (seed).
2. Dispare `PAYMENT_OVERDUE` no webhook para o `asaasId` de um desses alunos com `dateCreated` recente e `diasAtraso` > 5 (use um dueDate antigo) → o outbox deve criar um `DeviceCommand` `DISABLE` para aquele device/pessoa.
3. `curl` autenticado em `/acesso` (ou o banco) mostra o comando `DISABLE` na fila.
4. Dispare `PAYMENT_RECEIVED` → cria `ENABLE`.

- [ ] **Step 3: Auditoria**

Faça um override via API e confirme uma linha em `AuditLog`:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "select action, entity from \"AuditLog\" order by at desc limit 3;"
```

---

## Cobertura do spec (self-review) — Fase 3

| Requisito do spec | Task |
|---|---|
| Entidades de acesso (device, credential, mapping, policy, event, command, heartbeat, enrollment, override, audit) | 1 |
| Estados separados (AccessStatus/EnrollmentStatus/DeviceSyncStatus/DeviceCommandStatus) | 1 (enums) + 2 (AccessStatus derivado) |
| `evaluateAccessEligibility` pura, fora de componentes/webhooks/driver | 2 |
| Regras de acesso (cortesia, carência, cancelado, chargeback, override, sem-biometria, sem-sync) | 2 (testes cobrem cada uma) |
| Outbox: mudança financeira → recalcula acesso → DeviceCommand | 4 |
| Comandos idempotentes com estado (DeviceCommandStatus + dedupeKey) | 1, 3 |
| AuditLog de ações sensíveis | 3, 5 |
| Liberação/bloqueio manual pela recepção | 5 |
| `/acesso` (catracas, online/offline, heartbeat, fila, pendências, acessos, negados) | 6 |
| RBAC nas ações (override recepção; revoke admin) | 5 |

**Fora de escopo (Fase 4+):** consumo real dos `DeviceCommand` pelo agente (Fase 4 simulado / 5 real); recebimento de `AccessEvent`/heartbeat vindos do device (Fase 4); enrollment real (Fase 5-6); card na ficha do aluno (pode entrar na Fase 4). `AccessStatus` derivado (não persistido) — se precisar materializar depois, a política é a fonte única.

**Notas de risco:**
- O outbox roda best-effort após a transação financeira; se falhar, a reconciliação futura / re-trigger cobre (um job de recálculo em massa pode ser adicionado).
- `graceDays` está fixo em 5 no outbox; quando `AccessPolicy` por plano existir de fato, ler de lá.
- `AccessEvent`/heartbeat ainda não têm produtor nesta fase (chegam na Fase 4 via agente simulado) — o dashboard mostra vazio até lá.
