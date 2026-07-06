# Catraca — Fase 2 (Financeiro confiável) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a integração financeira com o Asaas confiável: espelho local de customer/subscription/payment, webhook idempotente que recebe rápido e processa de forma transacional/idempotente com guarda de ordem, `externalReference` ligando objetos Asaas aos ids internos, e reconciliação periódica.

**Architecture:** O webhook passa a **só persistir** o evento (`WebhookEvent`, único por `asaasEventId`) e responder 200 rápido; um **processor** separado aplica os efeitos (atualiza `Payment`/`Membership`) numa transação, idempotente e resistente a eventos fora de ordem (compara timestamps). Objetos Asaas ganham `externalReference` = id interno, e cada `paymentId` é persistido — resolvendo o bug de recorrências futuras com ids diferentes. Um job de reconciliação compara o Asaas com o banco.

**Tech Stack:** Next.js 16 (route handlers, runtime nodejs), Prisma 6 + PostgreSQL, Vitest, TypeScript. Sem dependências novas.

**Contexto (Fase 1 concluída — ler antes):**
- Banco Postgres via `docker compose up -d db`; Prisma 6; `src/lib/db.ts` exporta `prisma`; seed idempotente `npm run db:seed`.
- `src/lib/store.ts` é fachada async sobre `src/lib/repositories/*`. Tipos de domínio em `src/lib/types.ts`.
- Webhook atual: `src/app/api/webhooks/asaas/route.ts` chama `marcarCobrancaPaga/Atrasada` do store (muta `Cobranca`+`Membership`). É público (fail-closed em produção sem token).
- Cliente Asaas: `src/lib/asaas.ts` — `criarOuLocalizarCliente`, `criarAssinatura`, `primeiraCobrancaAssinatura`, `matricularNoAsaas` (fallback mock sem `ASAAS_API_KEY`). Tipos `AsaasCustomer/AsaasCharge/AsaasSubscription/AsaasMatricula`.
- Schema atual (`prisma/schema.prisma`): models `Unit, User, Session, Person, Plan, Membership, Cobranca, Despesa` e enums. `Membership.status` é `MembershipStatus`. `Cobranca` tem `asaasId?`, `assinaturaId?`.
- Testes: Vitest contra o Postgres real; reseed com `npm run db:seed` antes de testes que mutam. `npx tsc --noEmit` deve ficar 0.
- **Não** ler/expor `.env`/`.env.local`. **Não** entrar no domínio de acesso/catraca (Fase 3+).
- Migração destrutiva do Prisma (`migrate reset`) é bloqueada por guard; use `npm run db:seed` (idempotente) para reset de dados. Para mudanças de schema use `npx prisma migrate dev --name <nome>` (aditivo, não precisa reset).

**Decisão de modelagem:** a Fase 2 **adiciona** as tabelas financeiras (`WebhookEvent`, `BillingCustomer`, `BillingSubscription`, `Payment`) **sem remover** a `Cobranca` existente (as telas de cobrança ainda dependem dela). `Payment` é o registro financeiro rico e fonte da verdade do Asaas; a `Cobranca` continua como a projeção que as telas leem. O processor mantém as duas em sincronia. A unificação total `Cobranca`→`Payment` fica para uma limpeza posterior (fora do escopo desta fase, para não quebrar telas).

---

## Estrutura de arquivos (Fase 2)

**Novos:**
- `src/lib/billing/webhook-store.ts` — persistência idempotente de `WebhookEvent` (registrar, marcar processado/erro).
- `src/lib/billing/processor.ts` — aplica um `WebhookEvent` aos efeitos (Payment/Cobranca/Membership) transacional + idempotente + guarda de ordem.
- `src/lib/billing/reconcile.ts` — reconciliação: compara Asaas × banco e corrige divergências.
- `src/lib/repositories/billing.ts` — CRUD de `BillingCustomer`/`BillingSubscription`/`Payment`.
- `src/app/api/billing/reconcile/route.ts` — endpoint protegido (ADMIN) que dispara a reconciliação sob demanda.
- Testes: `src/lib/billing/*.test.ts`.

**Alterados:**
- `prisma/schema.prisma` (+ migração) — novas tabelas.
- `src/app/api/webhooks/asaas/route.ts` — passa a só persistir + enfileirar processamento.
- `src/lib/asaas.ts` — `externalReference` na criação de customer/subscription; helper para listar payments de uma subscription.
- `prisma/seed.ts` — semear `BillingCustomer`/`BillingSubscription`/`Payment` coerentes com as cobranças semente (para reconciliação/idempotência testarem contra dados).

---

## Task 1: Schema — WebhookEvent, BillingCustomer, BillingSubscription, Payment

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Adicionar enums e models ao final de `prisma/schema.prisma`**

Acrescente (não remova nada existente):

```prisma
enum WebhookProcessState {
  PENDING
  PROCESSED
  FAILED
  DEAD_LETTER
}

enum PaymentStatus {
  PENDING
  PAID
  OVERDUE
  REFUNDED
  CHARGEBACK
  CANCELED
}

model WebhookEvent {
  id           String              @id @default(cuid())
  asaasEventId String              @unique
  event        String
  paymentId    String?
  payload      Json
  processState WebhookProcessState @default(PENDING)
  attempts     Int                 @default(0)
  lastError    String?
  eventAt      DateTime?           // timestamp do evento no Asaas (para ordenação)
  receivedAt   DateTime            @default(now())
  processedAt  DateTime?

  @@index([processState, receivedAt])
  @@index([paymentId])
}

model BillingCustomer {
  id                String   @id @default(cuid())
  asaasCustomerId   String   @unique
  externalReference String?  // id interno (personId)
  person            Person   @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId          String   @unique
  createdAt         DateTime @default(now())

  subscriptions BillingSubscription[]
}

model BillingSubscription {
  id                   String          @id @default(cuid())
  asaasSubscriptionId  String          @unique
  externalReference    String?         // id interno (membershipId)
  customer             BillingCustomer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerId           String
  cycle                String          @default("MONTHLY")
  value                Float
  status               String          @default("ACTIVE")
  createdAt            DateTime         @default(now())

  payments Payment[]

  @@index([customerId])
}

model Payment {
  id                String               @id @default(cuid())
  asaasPaymentId    String               @unique
  externalReference String?
  subscription      BillingSubscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)
  subscriptionId    String?
  billingType       String               @default("UNDEFINED")
  value             Float
  dueDate           DateTime
  status            PaymentStatus        @default(PENDING)
  paidAt            DateTime?
  invoiceUrl        String?
  statusUpdatedAt   DateTime             @default(now()) // guarda de ordem
  createdAt         DateTime             @default(now())

  @@index([subscriptionId, dueDate])
  @@index([status])
}
```

- [ ] **Step 2: Adicionar as relações reversas em `Person`**

No model `Person`, adicione uma linha de relação (junto às outras relações `memberships`/`cobrancas`):

```prisma
  billingCustomer BillingCustomer?
```

- [ ] **Step 3: Criar a migração**

Run:
```bash
npx prisma migrate dev --name fase2_financeiro
```
Expected: cria `prisma/migrations/*_fase2_financeiro/` e gera o client. Aditivo (tabelas novas + 1 relação opcional) — sem reset.

- [ ] **Step 4: Verificar as tabelas**

Run:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "\dt" | grep -E "WebhookEvent|BillingCustomer|BillingSubscription|Payment"
```
Expected: as 4 tabelas aparecem.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): tabelas financeiras (WebhookEvent, BillingCustomer/Subscription, Payment)"
```

---

## Task 2: Repositório de billing

**Files:**
- Create: `src/lib/repositories/billing.ts`
- Test: `src/lib/repositories/billing.test.ts`

- [ ] **Step 1: Teste**

`src/lib/repositories/billing.test.ts`:
```ts
import { expect, test } from "vitest";
import { upsertPaymentRepo, paymentPorAsaasId } from "@/lib/repositories/billing";

test("upsertPaymentRepo cria e depois atualiza por asaasPaymentId (idempotente)", async () => {
  const dueDate = new Date("2026-08-01");
  const a = await upsertPaymentRepo({
    asaasPaymentId: "pay_test_f2", value: 100, dueDate, status: "PENDING",
    statusUpdatedAt: new Date("2026-07-01T10:00:00Z"),
  });
  expect(a.status).toBe("PENDING");
  const b = await upsertPaymentRepo({
    asaasPaymentId: "pay_test_f2", value: 100, dueDate, status: "PAID",
    statusUpdatedAt: new Date("2026-07-02T10:00:00Z"), paidAt: new Date("2026-07-02T10:00:00Z"),
  });
  expect(b.id).toBe(a.id); // mesmo registro
  expect(b.status).toBe("PAID");
  const found = await paymentPorAsaasId("pay_test_f2");
  expect(found?.status).toBe("PAID");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/repositories/billing.test.ts`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementar `src/lib/repositories/billing.ts`**

```ts
import { prisma } from "@/lib/db";
import type { Payment, PaymentStatus, BillingCustomer, BillingSubscription } from "@prisma/client";

export interface UpsertPaymentInput {
  asaasPaymentId: string;
  subscriptionId?: string | null;
  externalReference?: string | null;
  billingType?: string;
  value: number;
  dueDate: Date;
  status: PaymentStatus;
  paidAt?: Date | null;
  invoiceUrl?: string | null;
  statusUpdatedAt: Date;
}

export async function upsertPaymentRepo(input: UpsertPaymentInput): Promise<Payment> {
  return prisma.payment.upsert({
    where: { asaasPaymentId: input.asaasPaymentId },
    create: {
      asaasPaymentId: input.asaasPaymentId,
      subscriptionId: input.subscriptionId ?? null,
      externalReference: input.externalReference ?? null,
      billingType: input.billingType ?? "UNDEFINED",
      value: input.value,
      dueDate: input.dueDate,
      status: input.status,
      paidAt: input.paidAt ?? null,
      invoiceUrl: input.invoiceUrl ?? null,
      statusUpdatedAt: input.statusUpdatedAt,
    },
    update: {
      value: input.value,
      dueDate: input.dueDate,
      status: input.status,
      paidAt: input.paidAt ?? null,
      invoiceUrl: input.invoiceUrl ?? undefined,
      statusUpdatedAt: input.statusUpdatedAt,
    },
  });
}

export async function paymentPorAsaasId(asaasPaymentId: string): Promise<Payment | null> {
  return prisma.payment.findUnique({ where: { asaasPaymentId } });
}

export async function upsertBillingCustomerRepo(input: {
  asaasCustomerId: string; personId: string; externalReference?: string | null;
}): Promise<BillingCustomer> {
  return prisma.billingCustomer.upsert({
    where: { asaasCustomerId: input.asaasCustomerId },
    create: { asaasCustomerId: input.asaasCustomerId, personId: input.personId, externalReference: input.externalReference ?? input.personId },
    update: { externalReference: input.externalReference ?? undefined },
  });
}

export async function upsertBillingSubscriptionRepo(input: {
  asaasSubscriptionId: string; customerId: string; value: number;
  cycle?: string; status?: string; externalReference?: string | null;
}): Promise<BillingSubscription> {
  return prisma.billingSubscription.upsert({
    where: { asaasSubscriptionId: input.asaasSubscriptionId },
    create: {
      asaasSubscriptionId: input.asaasSubscriptionId, customerId: input.customerId,
      value: input.value, cycle: input.cycle ?? "MONTHLY", status: input.status ?? "ACTIVE",
      externalReference: input.externalReference ?? null,
    },
    update: { value: input.value, status: input.status ?? undefined },
  });
}

export async function listarPaymentsRepo(): Promise<Payment[]> {
  return prisma.payment.findMany({ orderBy: { dueDate: "asc" } });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/repositories/billing.test.ts`
Expected: PASS (Postgres no ar). Depois `npm run db:seed` para limpar o `pay_test_f2`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/billing.ts src/lib/repositories/billing.test.ts
git commit -m "feat(repo): repositório de billing (customer/subscription/payment idempotente)"
```

---

## Task 3: Webhook store (persistência idempotente do evento)

**Files:**
- Create: `src/lib/billing/webhook-store.ts`
- Test: `src/lib/billing/webhook-store.test.ts`

- [ ] **Step 1: Teste**

`src/lib/billing/webhook-store.test.ts`:
```ts
import { expect, test } from "vitest";
import { registrarWebhookEvent } from "@/lib/billing/webhook-store";

test("registrarWebhookEvent é idempotente por asaasEventId", async () => {
  const payload = { id: "evt_f2_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_x", value: 10 } };
  const first = await registrarWebhookEvent("evt_f2_1", payload);
  expect(first.created).toBe(true);
  const second = await registrarWebhookEvent("evt_f2_1", payload);
  expect(second.created).toBe(false); // já existia — não duplica
  expect(second.event.id).toBe(first.event.id);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/billing/webhook-store.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `src/lib/billing/webhook-store.ts`**

```ts
import { prisma } from "@/lib/db";
import type { WebhookEvent } from "@prisma/client";
import { Prisma } from "@prisma/client";

interface AsaasEventPayload {
  id?: string;
  event?: string;
  dateCreated?: string;
  payment?: { id?: string; dateCreated?: string };
}

/**
 * Persiste o evento de webhook de forma idempotente.
 * Retorna { created: false } se o asaasEventId já existia (não reprocessa efeito).
 */
export async function registrarWebhookEvent(
  asaasEventId: string,
  payload: AsaasEventPayload,
): Promise<{ created: boolean; event: WebhookEvent }> {
  const eventAtRaw = payload.dateCreated ?? payload.payment?.dateCreated;
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        asaasEventId,
        event: payload.event ?? "UNKNOWN",
        paymentId: payload.payment?.id ?? null,
        payload: payload as unknown as Prisma.InputJsonValue,
        eventAt: eventAtRaw ? new Date(eventAtRaw) : null,
      },
    });
    return { created: true, event };
  } catch (e) {
    // Colisão de unique (asaasEventId) = evento repetido → devolve o existente.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { asaasEventId } });
      return { created: false, event };
    }
    throw e;
  }
}

export async function marcarEventoProcessado(id: string): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id },
    data: { processState: "PROCESSED", processedAt: new Date() },
  });
}

export async function marcarEventoFalho(id: string, erro: string, deadLetter = false): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id },
    data: {
      processState: deadLetter ? "DEAD_LETTER" : "FAILED",
      lastError: erro.slice(0, 500),
      attempts: { increment: 1 },
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/billing/webhook-store.test.ts`
Expected: PASS. Depois `npm run db:seed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/webhook-store.ts src/lib/billing/webhook-store.test.ts
git commit -m "feat(billing): persistência idempotente de WebhookEvent"
```

---

## Task 4: Processor (aplica efeitos idempotente + guarda de ordem)

**Files:**
- Create: `src/lib/billing/processor.ts`
- Test: `src/lib/billing/processor.test.ts`

- [ ] **Step 1: Teste (idempotência + fora de ordem)**

`src/lib/billing/processor.test.ts`:
```ts
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { processarEvento } from "@/lib/billing/processor";

async function novoPayment(asaasPaymentId: string) {
  return prisma.payment.create({
    data: {
      asaasPaymentId, value: 129.9, dueDate: new Date("2026-08-01"),
      status: "PENDING", statusUpdatedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
}

test("PAYMENT_RECEIVED marca Payment PAID; reprocessar não muda nada (idempotente)", async () => {
  await novoPayment("pay_proc_1");
  const ev = {
    id: "evt_proc_1", event: "PAYMENT_RECEIVED",
    dateCreated: "2026-07-05T12:00:00Z",
    payment: { id: "pay_proc_1", status: "RECEIVED", paymentDate: "2026-07-05" },
  };
  await processarEvento(ev as never);
  let p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_proc_1" } });
  expect(p?.status).toBe("PAID");
  const paidAt1 = p?.paidAt?.toISOString();
  await processarEvento(ev as never); // reprocessa
  p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_proc_1" } });
  expect(p?.status).toBe("PAID");
  expect(p?.paidAt?.toISOString()).toBe(paidAt1);
});

test("evento fora de ordem não regride status (OVERDUE antigo após RECEIVED novo)", async () => {
  await novoPayment("pay_proc_2");
  await processarEvento({
    id: "evt_proc_2a", event: "PAYMENT_RECEIVED", dateCreated: "2026-07-10T12:00:00Z",
    payment: { id: "pay_proc_2", status: "RECEIVED", paymentDate: "2026-07-10" },
  } as never);
  // evento OVERDUE mais ANTIGO chega depois → deve ser ignorado
  await processarEvento({
    id: "evt_proc_2b", event: "PAYMENT_OVERDUE", dateCreated: "2026-07-08T12:00:00Z",
    payment: { id: "pay_proc_2", status: "OVERDUE" },
  } as never);
  const p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_proc_2" } });
  expect(p?.status).toBe("PAID"); // permaneceu pago
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/billing/processor.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `src/lib/billing/processor.ts`**

```ts
import { prisma } from "@/lib/db";
import type { PaymentStatus } from "@prisma/client";

interface AsaasEvent {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: {
    id: string;
    status?: string;
    value?: number;
    dueDate?: string;
    paymentDate?: string;
    invoiceUrl?: string;
    subscription?: string;
  };
}

/** Mapeia o evento Asaas para o novo status de Payment. */
function statusDoEvento(event: string): PaymentStatus | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": return "PAID";
    case "PAYMENT_OVERDUE": return "OVERDUE";
    case "PAYMENT_REFUNDED": return "REFUNDED";
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE": return "CHARGEBACK";
    case "PAYMENT_DELETED": return "CANCELED";
    default: return null;
  }
}

/** Reflete o PaymentStatus na Cobranca legada (que as telas ainda usam) + Membership. */
function cobrancaStatusDe(s: PaymentStatus): "pago" | "atrasado" | "pendente" {
  if (s === "PAID") return "pago";
  if (s === "OVERDUE") return "atrasado";
  return "pendente";
}
function membershipStatusDe(s: PaymentStatus): "ACTIVE" | "SUSPENDED" | null {
  if (s === "PAID") return "ACTIVE";
  if (s === "OVERDUE" || s === "CHARGEBACK") return "SUSPENDED";
  return null;
}

/**
 * Aplica um evento Asaas de forma idempotente e resistente a ordem.
 * - Idempotente: reprocessar o mesmo estado não muda paidAt/timestamps.
 * - Ordem: só aplica se o eventAt for >= statusUpdatedAt do Payment.
 */
export async function processarEvento(ev: AsaasEvent): Promise<void> {
  const novoStatus = statusDoEvento(ev.event);
  if (!novoStatus || !ev.payment?.id) return; // evento irrelevante

  const asaasPaymentId = ev.payment.id;
  const eventAt = ev.dateCreated ? new Date(ev.dateCreated) : new Date();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.payment.findUnique({ where: { asaasPaymentId } });

    // Guarda de ordem: ignora evento mais antigo que o último aplicado.
    if (existing && existing.statusUpdatedAt > eventAt) return;
    // Idempotência: mesmo status e não é mais novo → nada a fazer.
    if (existing && existing.status === novoStatus && existing.statusUpdatedAt.getTime() === eventAt.getTime()) return;

    const paidAt = novoStatus === "PAID"
      ? (ev.payment.paymentDate ? new Date(ev.payment.paymentDate) : eventAt)
      : null;

    const payment = await tx.payment.upsert({
      where: { asaasPaymentId },
      create: {
        asaasPaymentId,
        value: ev.payment.value ?? existing?.value ?? 0,
        dueDate: ev.payment.dueDate ? new Date(ev.payment.dueDate) : (existing?.dueDate ?? eventAt),
        status: novoStatus,
        paidAt,
        invoiceUrl: ev.payment.invoiceUrl ?? null,
        statusUpdatedAt: eventAt,
      },
      update: { status: novoStatus, paidAt, statusUpdatedAt: eventAt },
    });

    // Projeta na Cobranca legada (por asaasId) — mantém as telas coerentes.
    const cob = await tx.cobranca.findFirst({ where: { asaasId: asaasPaymentId } });
    if (cob) {
      await tx.cobranca.update({ where: { id: cob.id }, data: { status: cobrancaStatusDe(novoStatus) } });
      const ms = membershipStatusDe(novoStatus);
      if (ms) await tx.membership.updateMany({ where: { personId: cob.personId }, data: { status: ms } });
    }

    void payment;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/billing/processor.test.ts`
Expected: PASS. Depois `npm run db:seed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/processor.ts src/lib/billing/processor.test.ts
git commit -m "feat(billing): processor idempotente com guarda de ordem (Payment/Cobranca/Membership)"
```

---

## Task 5: Webhook — receber rápido, persistir, processar

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`

- [ ] **Step 1: Reescrever o handler**

Substitua o arquivo por (mantém a validação de token/fail-closed; troca o efeito direto por persistir+processar):

```ts
import { NextResponse } from "next/server";
import { registrarWebhookEvent, marcarEventoProcessado, marcarEventoFalho } from "@/lib/billing/webhook-store";
import { processarEvento } from "@/lib/billing/processor";

// Webhook do Asaas — recebe rápido, persiste idempotente, processa o efeito.
// Público (o Asaas chama). Em produção exige ASAAS_WEBHOOK_TOKEN.
interface AsaasWebhookBody {
  id?: string;
  event: string;
  dateCreated?: string;
  payment?: { id: string; status?: string; value?: number; dueDate?: string; paymentDate?: string; invoiceUrl?: string; subscription?: string; dateCreated?: string };
}

export async function POST(req: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (process.env.NODE_ENV === "production" && !expected) {
    return NextResponse.json({ error: "webhook token not configured" }, { status: 503 });
  }
  if (expected && req.headers.get("asaas-access-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as AsaasWebhookBody;
  // O Asaas envia um id de evento em `id`; fallback determinístico se ausente.
  const asaasEventId = body.id ?? `${body.event}:${body.payment?.id ?? "none"}:${body.dateCreated ?? ""}`;

  // 1) Persiste idempotente e responde rápido.
  const { created, event } = await registrarWebhookEvent(asaasEventId, body);
  if (!created) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // 2) Processa o efeito (best-effort síncrono; marca estado do evento).
  try {
    await processarEvento(body);
    await marcarEventoProcessado(event.id);
  } catch (e) {
    await marcarEventoFalho(event.id, e instanceof Error ? e.message : String(e));
    // Ainda responde 200 para o Asaas não re-tentar em loop; a reconciliação/retry cobre.
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Teste manual (dev server + curl)**

Suba o db e o dev server (`docker compose up -d db`, `npm run db:seed`, `npm run dev`), descubra a porta, e simule dois eventos iguais + um fora de ordem. A cobrança semente `pay_002` existe. Rode:
```bash
B=http://localhost:3000  # ajuste a porta se necessário
# 1º evento (novo) → processa
curl -s -X POST $B/api/webhooks/asaas -H "Content-Type: application/json" \
  -d '{"id":"evt_m1","event":"PAYMENT_RECEIVED","dateCreated":"2026-07-06T12:00:00Z","payment":{"id":"pay_002","status":"RECEIVED","paymentDate":"2026-07-06"}}'; echo
# mesmo evento de novo → duplicate
curl -s -X POST $B/api/webhooks/asaas -H "Content-Type: application/json" \
  -d '{"id":"evt_m1","event":"PAYMENT_RECEIVED","dateCreated":"2026-07-06T12:00:00Z","payment":{"id":"pay_002","status":"RECEIVED","paymentDate":"2026-07-06"}}'; echo
```
Expected: 1º → `{"received":true}`; 2º → `{"received":true,"duplicate":true}`. Confira no banco que só há 1 `WebhookEvent` com `asaasEventId='evt_m1'` e que a `Cobranca` de `pay_002` ficou `pago`:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "select count(*) from \"WebhookEvent\" where \"asaasEventId\"='evt_m1'; select status from \"Cobranca\" where \"asaasId\"='pay_002';"
```
Expected: count 1; status `pago`. Depois `npm run db:seed` para limpar.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/asaas/route.ts
git commit -m "refactor(webhook): recebe rápido + persiste WebhookEvent idempotente + processa efeito"
```

---

## Task 6: externalReference e persistência dos objetos Asaas na matrícula

**Files:**
- Modify: `src/lib/asaas.ts`
- Modify: `src/lib/repositories/pessoas.ts` (persistir billing na matrícula)

- [ ] **Step 1: `asaas.ts` — enviar externalReference**

Leia `src/lib/asaas.ts`. Em `criarOuLocalizarCliente`, adicione `externalReference?: string` ao input e inclua no body do POST real. Em `criarAssinatura`, adicione `externalReference?: string` ao input e inclua no body. Em `matricularNoAsaas`, aceite `membershipId?: string` e `personId?: string` e repasse: `externalReference` do customer = `personId`, do subscription = `membershipId`. Mantenha o fallback mock. Exemplo do ajuste em `criarAssinatura` (body real):

```ts
    body: JSON.stringify({
      customer: input.customer,
      billingType: "PIX",
      cycle: "MONTHLY",
      value: input.value,
      nextDueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
```
E na assinatura da função: `export async function criarAssinatura(input: { customer: string; value: number; description?: string; externalReference?: string; }): Promise<AsaasSubscription>`. Faça o análogo em `criarOuLocalizarCliente` (campo `externalReference` no body do customer). Em `matricularNoAsaas`, passe `externalReference: input.personId` (customer) e `externalReference: input.membershipId` (subscription) — adicione esses dois campos opcionais ao input do `matricularNoAsaas`.

- [ ] **Step 2: `pessoas.ts` — persistir BillingCustomer/Subscription/Payment na matrícula**

No `matricularPessoaRepo`, após criar a `Membership` e a `Cobranca` com os dados do Asaas, quando `asaas` estiver presente, persista o espelho financeiro. Importe os repositórios de billing e, dentro da mesma função (após o `$transaction` que já existe, faça um segundo passo — pode ser fora da transação, pois é espelho), grave:

```ts
  if (asaas) {
    const { upsertBillingCustomerRepo, upsertBillingSubscriptionRepo, upsertPaymentRepo } =
      await import("@/lib/repositories/billing");
    const bc = await upsertBillingCustomerRepo({
      asaasCustomerId: asaas.customerId, personId: id, externalReference: id,
    });
    const bs = await upsertBillingSubscriptionRepo({
      asaasSubscriptionId: asaas.assinaturaId, customerId: bc.id, value: plano.valorMensal,
      externalReference: undefined,
    });
    await upsertPaymentRepo({
      asaasPaymentId: asaas.cobrancaId, subscriptionId: bs.id, value: plano.valorMensal,
      dueDate: venc, status: "PENDING", invoiceUrl: asaas.linkPagamento,
      statusUpdatedAt: new Date(),
    });
  }
```
(Use o `plano` e `venc` já calculados na função. `BillingCustomer.personId` é unique — o upsert por `asaasCustomerId` cobre re-matrícula do mesmo cliente; se a pessoa já tiver um `BillingCustomer` com outro asaasId, prevalece o upsert por asaasCustomerId — aceitável nesta fase.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 4: Teste (mock) — matrícula grava o espelho financeiro**

Sem `ASAAS_API_KEY` (modo mock), a matrícula gera ids `sub_mock_*`/`pay_mock_*`. Escreva um teste `src/lib/repositories/billing-matricula.test.ts`:
```ts
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { criarPessoaRepo, matricularPessoaRepo } from "@/lib/repositories/pessoas";

test("matrícula com dados Asaas grava BillingCustomer/Subscription/Payment", async () => {
  const p = await criarPessoaRepo({ nome: "Billing Teste", origem: "balcao", telefone: "(11) 90000-0000", cpf: "111.222.333-44" });
  await matricularPessoaRepo(p.id, "p-mensal", {
    customerId: "cus_bt_1", assinaturaId: "sub_bt_1", cobrancaId: "pay_bt_1",
    linkPagamento: "https://asaas.com/c/pay_bt_1",
  });
  const bc = await prisma.billingCustomer.findUnique({ where: { asaasCustomerId: "cus_bt_1" } });
  const pay = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_bt_1" } });
  expect(bc?.personId).toBe(p.id);
  expect(pay?.status).toBe("PENDING");
});
```
Run: `npm test -- src/lib/repositories/billing-matricula.test.ts` → PASS. Depois `npm run db:seed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/asaas.ts src/lib/repositories/pessoas.ts src/lib/repositories/billing-matricula.test.ts
git commit -m "feat(billing): externalReference no Asaas + espelho financeiro na matrícula"
```

---

## Task 7: Reconciliação (Asaas × banco)

**Files:**
- Create: `src/lib/billing/reconcile.ts`
- Create: `src/app/api/billing/reconcile/route.ts`
- Test: `src/lib/billing/reconcile.test.ts`

- [ ] **Step 1: Teste (reconcilia a partir de uma lista de payments "do Asaas")**

`src/lib/billing/reconcile.test.ts`:
```ts
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { reconciliarPayments } from "@/lib/billing/reconcile";

test("reconciliarPayments cria payment ausente e corrige status divergente", async () => {
  // payment que o banco não tem ainda
  const res = await reconciliarPayments([
    { id: "pay_rec_1", status: "RECEIVED", value: 99.9, dueDate: "2026-08-01", paymentDate: "2026-07-20" },
  ]);
  expect(res.criados).toBeGreaterThanOrEqual(1);
  const p = await prisma.payment.findUnique({ where: { asaasPaymentId: "pay_rec_1" } });
  expect(p?.status).toBe("PAID");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/billing/reconcile.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `src/lib/billing/reconcile.ts`**

```ts
import { prisma } from "@/lib/db";
import { upsertPaymentRepo } from "@/lib/repositories/billing";
import type { PaymentStatus } from "@prisma/client";

export interface AsaasPaymentLike {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  subscription?: string;
}

function mapStatus(s: string): PaymentStatus {
  switch (s) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH": return "PAID";
    case "OVERDUE": return "OVERDUE";
    case "REFUNDED": return "REFUNDED";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE": return "CHARGEBACK";
    case "DELETED": return "CANCELED";
    default: return "PENDING";
  }
}

/** Reconcilia uma lista de payments (como vinda do Asaas) contra o banco. */
export async function reconciliarPayments(
  asaasPayments: AsaasPaymentLike[],
): Promise<{ criados: number; atualizados: number; total: number }> {
  let criados = 0;
  let atualizados = 0;
  for (const ap of asaasPayments) {
    const status = mapStatus(ap.status);
    const existing = await prisma.payment.findUnique({ where: { asaasPaymentId: ap.id } });
    await upsertPaymentRepo({
      asaasPaymentId: ap.id,
      value: ap.value,
      dueDate: new Date(ap.dueDate),
      status,
      paidAt: status === "PAID" ? new Date(ap.paymentDate ?? ap.dueDate) : null,
      invoiceUrl: ap.invoiceUrl ?? null,
      statusUpdatedAt: new Date(), // reconciliação = verdade mais recente
    });
    if (existing) atualizados++;
    else criados++;
  }
  return { criados, atualizados, total: asaasPayments.length };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/billing/reconcile.test.ts`
Expected: PASS. Depois `npm run db:seed`.

- [ ] **Step 5: Endpoint protegido de reconciliação**

`src/app/api/billing/reconcile/route.ts`:
```ts
import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { reconciliarPayments, type AsaasPaymentLike } from "@/lib/billing/reconcile";
import { listarPaymentsAsaas } from "@/lib/asaas";

export async function POST() {
  const g = await exigirSessaoApi();
  if (g.erro) return g.erro;
  if (!podePapel(g.user!.role as Papel, ["ADMIN"])) {
    return NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 });
  }
  const payments: AsaasPaymentLike[] = await listarPaymentsAsaas();
  const res = await reconciliarPayments(payments);
  return NextResponse.json(res);
}
```

- [ ] **Step 6: `asaas.ts` — `listarPaymentsAsaas` (com fallback mock vazio)**

Adicione ao final de `src/lib/asaas.ts`:
```ts
/** Lista pagamentos da conta no Asaas (para reconciliação). Mock: lista vazia. */
export async function listarPaymentsAsaas(): Promise<import("@/lib/billing/reconcile").AsaasPaymentLike[]> {
  if (!temCredenciais()) return [];
  const res = await fetch(`${ASAAS_BASE}/payments?limit=100`, {
    headers: { access_token: process.env.ASAAS_API_KEY! },
  });
  if (!res.ok) throw new Error(`Asaas payments list: ${res.status}`);
  const data = (await res.json()) as { data: Array<{ id: string; status: string; value: number; dueDate: string; paymentDate?: string; invoiceUrl?: string; subscription?: string }> };
  return data.data.map((p) => ({
    id: p.id, status: p.status, value: p.value, dueDate: p.dueDate,
    paymentDate: p.paymentDate, invoiceUrl: p.invoiceUrl, subscription: p.subscription,
  }));
}
```

- [ ] **Step 7: Typecheck + teste do endpoint (mock devolve vazio)**

Run: `npx tsc --noEmit` (0 erros). Com dev server + login ADMIN:
```bash
curl -s -b /tmp/cj.txt -X POST http://localhost:3000/api/billing/reconcile; echo
```
Expected (modo mock, sem chave): `{"criados":0,"atualizados":0,"total":0}`. Sem login → 401; login não-ADMIN → 403.

- [ ] **Step 8: Commit**

```bash
git add src/lib/billing/reconcile.ts src/lib/billing/reconcile.test.ts "src/app/api/billing/reconcile" src/lib/asaas.ts
git commit -m "feat(billing): reconciliação Asaas × banco + endpoint ADMIN"
```

---

## Task 8: Seed — espelho financeiro coerente

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Semear BillingCustomer/Subscription/Payment das cobranças com asaasId**

No `prisma/seed.ts`, após criar as `cobrancas` semente, para cada cobrança que tem `asaasId`, crie um `Payment` correspondente (e um `BillingCustomer`/`BillingSubscription` mínimo por aluno com asaasId). Adicione, dentro do `main()` após o loop de cobranças, e **inclua as tabelas novas no bloco de limpeza idempotente do topo** (deleteMany de Payment, BillingSubscription, BillingCustomer, WebhookEvent — em ordem FK-safe: Payment → BillingSubscription → BillingCustomer, e WebhookEvent isolado):

No bloco de limpeza (topo do main), adicione ANTES do `prisma.cobranca.deleteMany()`:
```ts
  await prisma.payment.deleteMany();
  await prisma.billingSubscription.deleteMany();
  await prisma.billingCustomer.deleteMany();
  await prisma.webhookEvent.deleteMany();
```
Após o loop de cobranças, adicione:
```ts
  // Espelho financeiro para as cobranças que têm asaasId
  const statusPay: Record<string, "PENDING" | "PAID" | "OVERDUE"> = {
    pago: "PAID", pendente: "PENDING", atrasado: "OVERDUE",
  };
  for (const c of cobrancas) {
    if (!c.asaasId) continue;
    const person = await prisma.person.findUnique({ where: { codigo: c.codigo } });
    if (!person) continue;
    const bc = await prisma.billingCustomer.upsert({
      where: { asaasCustomerId: `cus_seed_${c.codigo}` },
      update: {},
      create: { asaasCustomerId: `cus_seed_${c.codigo}`, personId: person.id, externalReference: person.id },
    });
    const bs = await prisma.billingSubscription.upsert({
      where: { asaasSubscriptionId: `sub_seed_${c.codigo}` },
      update: {},
      create: { asaasSubscriptionId: `sub_seed_${c.codigo}`, customerId: bc.id, value: c.valor },
    });
    await prisma.payment.upsert({
      where: { asaasPaymentId: c.asaasId },
      update: {},
      create: {
        asaasPaymentId: c.asaasId, subscriptionId: bs.id, value: c.valor,
        dueDate: offset(c.venc), status: statusPay[c.status] ?? "PENDING",
        paidAt: c.status === "pago" ? offset(c.venc) : null,
        statusUpdatedAt: offset(c.venc),
      },
    });
  }
```
Nota: `BillingCustomer.personId` é unique — se dois `cobrancas` semente pertencerem à mesma pessoa (não é o caso no seed atual, cada aluno tem 1 cobrança), o segundo upsert falharia; como o seed tem 1 cobrança por aluno, está OK. (Se mudar, dedupe por person.)

- [ ] **Step 2: Rodar o seed 2x (idempotência) e verificar**

Run:
```bash
npm run db:seed && npm run db:seed
docker compose exec -T db psql -U coliseu -d coliseu -c "select (select count(*) from \"Payment\") payments, (select count(*) from \"BillingCustomer\") customers;"
```
Expected: seed roda 2x sem erro; `Payment` = 6 (as cobranças com asaasId: pay_001,002,004,005,006,008 — a pay_003 tem asaasId null), `BillingCustomer` = 6.

- [ ] **Step 3: Suite completa**

Run: `npm test`
Expected: todos passam (repos, billing, webhook-store, processor, reconcile, auth).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(seed): espelho financeiro (Payment/Billing*) coerente com as cobranças"
```

---

## Task 9: Verificação final da Fase 2

- [ ] **Step 1: Testes + typecheck + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: testes verdes; 0 erros de tipo; build conclui (novas rotas `/api/billing/reconcile`).

- [ ] **Step 2: Smoke de idempotência ponta a ponta**

Com `npm run db:seed` e dev server:
1. Dispare `PAYMENT_RECEIVED` para `pay_004` (que está `atrasado`) → vira `pago` + aluno `ativo`.
2. Dispare o MESMO evento (mesmo `id`) → resposta `duplicate: true`, sem efeito repetido.
3. Dispare um `PAYMENT_OVERDUE` com `dateCreated` anterior → status permanece `pago` (guarda de ordem).
4. Confira `WebhookEvent`: 2 linhas (evt do passo 1 e do passo 3), a do passo 1 `PROCESSED`.

- [ ] **Step 3: Confirmar persistência de cada paymentId**

Run:
```bash
docker compose exec -T db psql -U coliseu -d coliseu -c "select \"asaasPaymentId\", status from \"Payment\" order by \"asaasPaymentId\";"
```
Expected: cada cobrança do Asaas tem seu `Payment` próprio (ids distintos) — o bug de "só a 1ª cobrança" está resolvido no modelo.

---

## Cobertura do spec (self-review) — Fase 2

| Requisito do spec (§6) | Task |
|---|---|
| `externalReference` ligando objetos Asaas a ids internos | 6 |
| Persistir `customerId`, `subscriptionId`, cada `paymentId` | 1, 2, 6, 8 |
| Recebimento idempotente de webhooks (`WebhookEvent` único) | 1, 3, 5 |
| Chave única impede processamento duplicado | 3 (asaasEventId unique) |
| Processamento transacional | 4 (`$transaction`) |
| Eventos fora de ordem | 4 (guarda `statusUpdatedAt`) |
| Recebimento rápido separado do processamento | 5 |
| Reconciliação periódica | 7 |
| Retry / dead-letter (base) | 3 (`marcarEventoFalho`, DEAD_LETTER) |
| Criar assinatura ≠ pagamento confirmado | preservado (matrícula = PENDING; só evento paga) |
| Auditoria da mudança | parcial (WebhookEvent + processState); AuditLog completo é Fase 3 |

**Fora de escopo (fases posteriores):** unificar `Cobranca`→`Payment` (mantidas as duas para não quebrar telas); `AuditLog` dedicado; agendamento automático do job de reconciliação (por ora é endpoint sob demanda — um cron/rota agendada entra com a infra de deploy).

**Notas de risco:**
- O processamento do webhook é síncrono "best-effort" e marca `FAILED` sem re-tentar automaticamente; a reconciliação cobre o gap. Um worker de retry com backoff pode ser adicionado depois.
- `Cobranca` e `Payment` coexistem; o processor mantém a `Cobranca` como projeção. Manter isso em mente ao mexer em cobrança.
