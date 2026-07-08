# Freelandoo Token pelo Painel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin gera/rotaciona o Bearer token da Gym Provider API (`/api/freelandoo/*`) por um card no painel, com hash no banco e fallback para a env atual.

**Architecture:** Novo model `ApiToken` (um por provider, hash SHA-256). Lib `src/lib/freelandoo/token.ts` concentra gerar/status; `exigirFreelandoo` vira async e valida contra o banco com fallback env. Rota `/api/settings/freelandoo-token` (ADMIN) expõe GET status / POST gerar. Card client-side no painel, renderizado só para ADMIN.

**Tech Stack:** Next.js 16 App Router, Prisma 6 + Postgres (docker `oliseu-db-1`), Vitest (integração, sequencial, DB seedado), Tailwind 4 + primitivos próprios.

**Spec:** `docs/superpowers/specs/2026-07-08-freelandoo-token-painel-design.md`

**Atenção (Windows):** parar o dev server antes de `prisma migrate dev` (lock de DLL do Prisma). O Postgres em docker (`oliseu-db-1`) precisa estar de pé para migration e testes.

---

### Task 1: Model `ApiToken` + migration

**Files:**
- Modify: `prisma/schema.prisma` (model novo no fim; back-relation no `User`)

- [ ] **Step 1: Parar o dev server (lock do Prisma no Windows)**

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -Confirm:$false }
```

- [ ] **Step 2: Adicionar o model e a back-relation**

No fim de `prisma/schema.prisma`:

```prisma
model ApiToken {
  id          String    @id @default(cuid())
  provider    String    @unique // "freelandoo"
  tokenHash   String    // sha256 hex do token em claro — nunca o token
  createdAt   DateTime  @default(now())
  createdBy   User      @relation(fields: [createdById], references: [id])
  createdById String
  lastUsedAt  DateTime?
}
```

No model `User` (linha ~79, junto de `sessions`):

```prisma
  apiTokens    ApiToken[]
```

- [ ] **Step 3: Rodar a migration**

Run: `npx prisma migrate dev --name api_token_freelandoo`
Expected: `Your database is now in sync with your schema` + client regenerado. (Se falhar com EPERM na DLL, o dev server ainda está vivo — repita o Step 1.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(freelandoo): model ApiToken para token gerado pelo painel"
```

---

### Task 2: Lib de token (`gerarTokenFreelandoo` / `statusTokenFreelandoo`)

**Files:**
- Create: `src/lib/freelandoo/token.ts`
- Test: `src/lib/freelandoo/token.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

`src/lib/freelandoo/token.test.ts`:

```ts
import { beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import {
  FREELANDOO_PROVIDER,
  gerarTokenFreelandoo,
  sha256Hex,
  statusTokenFreelandoo,
} from "@/lib/freelandoo/token";

async function adminSeed() {
  return prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
}

beforeEach(async () => {
  await prisma.apiToken.deleteMany({ where: { provider: FREELANDOO_PROVIDER } });
});

test("gerar cria token de 64 hex, guarda só o hash e status reflete", async () => {
  const admin = await adminSeed();
  const token = await gerarTokenFreelandoo(admin.id);
  expect(token).toMatch(/^[0-9a-f]{64}$/);

  const row = await prisma.apiToken.findUniqueOrThrow({ where: { provider: FREELANDOO_PROVIDER } });
  expect(row.tokenHash).toBe(sha256Hex(token));
  expect(row.tokenHash).not.toBe(token);

  const status = await statusTokenFreelandoo();
  expect(status.exists).toBe(true);
  expect(status.createdByNome).toBe(admin.nome);
  expect(status.lastUsedAt).toBeNull();
});

test("status sem token gerado", async () => {
  expect(await statusTokenFreelandoo()).toEqual({
    exists: false, createdAt: null, createdByNome: null, lastUsedAt: null,
  });
});

test("rotacionar substitui o hash — o token antigo deixa de bater", async () => {
  const admin = await adminSeed();
  const antigo = await gerarTokenFreelandoo(admin.id);
  const novo = await gerarTokenFreelandoo(admin.id);
  expect(novo).not.toBe(antigo);

  const row = await prisma.apiToken.findUniqueOrThrow({ where: { provider: FREELANDOO_PROVIDER } });
  expect(row.tokenHash).toBe(sha256Hex(novo));
  expect(row.tokenHash).not.toBe(sha256Hex(antigo));

  const count = await prisma.apiToken.count({ where: { provider: FREELANDOO_PROVIDER } });
  expect(count).toBe(1);
});

test("gerar registra AuditLog sem vazar hash nem token", async () => {
  const admin = await adminSeed();
  const token = await gerarTokenFreelandoo(admin.id);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { entity: "ApiToken", action: "freelandoo_token.rotate" },
    orderBy: { at: "desc" },
  });
  expect(log.actorType).toBe("USER");
  expect(log.actorId).toBe(admin.id);
  const dump = JSON.stringify(log);
  expect(dump).not.toContain(token);
  expect(dump).not.toContain(sha256Hex(token));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/lib/freelandoo/token.test.ts`
Expected: FAIL — módulo `@/lib/freelandoo/token` não existe.

- [ ] **Step 3: Implementar**

`src/lib/freelandoo/token.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { registrarAudit } from "@/lib/access/audit";

export const FREELANDOO_PROVIDER = "freelandoo";

export function sha256Hex(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export type StatusTokenFreelandoo = {
  exists: boolean;
  createdAt: string | null;
  createdByNome: string | null;
  lastUsedAt: string | null;
};

/** Gera (ou rotaciona) o token da Gym Provider API. Retorna o valor em claro — única vez que ele existe fora da memória. */
export async function gerarTokenFreelandoo(actorUserId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const anterior = await prisma.apiToken.findUnique({ where: { provider: FREELANDOO_PROVIDER } });
  const row = await prisma.apiToken.upsert({
    where: { provider: FREELANDOO_PROVIDER },
    update: { tokenHash: sha256Hex(token), createdAt: new Date(), createdById: actorUserId, lastUsedAt: null },
    create: { provider: FREELANDOO_PROVIDER, tokenHash: sha256Hex(token), createdById: actorUserId },
  });
  await registrarAudit({
    actorType: "USER",
    actorId: actorUserId,
    action: "freelandoo_token.rotate",
    entity: "ApiToken",
    entityId: row.id,
    // metadados apenas — nunca token nem hash
    before: anterior ? { createdAt: anterior.createdAt.toISOString(), createdById: anterior.createdById } : null,
    after: { createdAt: row.createdAt.toISOString(), createdById: actorUserId },
  });
  return token;
}

export async function statusTokenFreelandoo(): Promise<StatusTokenFreelandoo> {
  const t = await prisma.apiToken.findUnique({
    where: { provider: FREELANDOO_PROVIDER },
    include: { createdBy: { select: { nome: true } } },
  });
  if (!t) return { exists: false, createdAt: null, createdByNome: null, lastUsedAt: null };
  return {
    exists: true,
    createdAt: t.createdAt.toISOString(),
    createdByNome: t.createdBy.nome,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- src/lib/freelandoo/token.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/freelandoo/token.ts src/lib/freelandoo/token.test.ts
git commit -m "feat(freelandoo): lib de geracao/rotacao/status do token da API"
```

---

### Task 3: `exigirFreelandoo` async — banco primeiro, env como fallback

**Files:**
- Modify: `src/lib/freelandoo/auth.ts` (reescrever)
- Modify: `src/app/api/freelandoo/member/route.ts:6` (`await`)
- Modify: `src/app/api/freelandoo/access-events/route.ts:6` (`await`)
- Modify: `src/app/api/freelandoo/payments/route.ts:6` (`await`)
- Test: `src/lib/freelandoo/auth.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

`src/lib/freelandoo/auth.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { prisma } from "@/lib/db";
import { exigirFreelandoo } from "@/lib/freelandoo/auth";
import { FREELANDOO_PROVIDER, gerarTokenFreelandoo } from "@/lib/freelandoo/token";

function reqCom(token?: string): Request {
  return new Request("http://localhost/api/freelandoo/member", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(async () => {
  await prisma.apiToken.deleteMany({ where: { provider: FREELANDOO_PROVIDER } });
  vi.stubEnv("FREELANDOO_API_TOKEN", "");
  delete process.env.FREELANDOO_API_TOKEN;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("token do banco válido passa e marca lastUsedAt", async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const token = await gerarTokenFreelandoo(admin.id);
  expect(await exigirFreelandoo(reqCom(token))).toBeNull();
  const row = await prisma.apiToken.findUniqueOrThrow({ where: { provider: FREELANDOO_PROVIDER } });
  expect(row.lastUsedAt).not.toBeNull();
});

test("com token no banco, valor errado dá 401 — mesmo se a env casar", async () => {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  await gerarTokenFreelandoo(admin.id);
  vi.stubEnv("FREELANDOO_API_TOKEN", "valor-da-env");
  const res = await exigirFreelandoo(reqCom("valor-da-env"));
  expect(res?.status).toBe(401);
});

test("sem registro no banco cai no fallback da env", async () => {
  vi.stubEnv("FREELANDOO_API_TOKEN", "segredo-env");
  expect(await exigirFreelandoo(reqCom("segredo-env"))).toBeNull();
  const res = await exigirFreelandoo(reqCom("errado"));
  expect(res?.status).toBe(401);
});

test("dev sem banco e sem env libera", async () => {
  expect(await exigirFreelandoo(reqCom())).toBeNull();
});

test("produção sem banco e sem env dá 503", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const res = await exigirFreelandoo(reqCom("qualquer"));
  expect(res?.status).toBe(503);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- src/lib/freelandoo/auth.test.ts`
Expected: FAIL — testes de banco quebram (função atual é síncrona e ignora o banco; `res` será `NextResponse` onde se espera `null` etc.).

- [ ] **Step 3: Reescrever `src/lib/freelandoo/auth.ts`**

Conteúdo completo do arquivo:

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FREELANDOO_PROVIDER, sha256Hex } from "@/lib/freelandoo/token";

function iguaisConstante(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Valida o Bearer token da Gym Provider API (consumida pela Freelandoo).
 * Precedência: token gerado pelo painel (tabela ApiToken) → env
 * FREELANDOO_API_TOKEN. Sem nenhum dos dois: dev libera, produção 503.
 * Comparações constant-time.
 */
export async function exigirFreelandoo(req: Request): Promise<NextResponse | null> {
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  const registro = await prisma.apiToken.findUnique({ where: { provider: FREELANDOO_PROVIDER } });
  if (registro) {
    if (!iguaisConstante(sha256Hex(given), registro.tokenHash)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // best-effort: falha aqui não derruba a requisição autenticada
    await prisma.apiToken
      .update({ where: { id: registro.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return null;
  }

  const expected = process.env.FREELANDOO_API_TOKEN;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "gym provider token not configured" }, { status: 503 });
    }
    return null; // dev sem token configurado: libera (mesma postura do agente)
  }
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
```

- [ ] **Step 4: Atualizar os 3 handlers para `await`**

Em `src/app/api/freelandoo/member/route.ts`, `src/app/api/freelandoo/access-events/route.ts` e `src/app/api/freelandoo/payments/route.ts`, a linha 6 muda de:

```ts
  const erro = exigirFreelandoo(req);
```

para:

```ts
  const erro = await exigirFreelandoo(req);
```

- [ ] **Step 5: Rodar e ver passar (suíte completa — os testes existentes de freelandoo/mapping não podem quebrar)**

Run: `npm run test`
Expected: tudo verde, incluindo os 5 novos de `auth.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/freelandoo/auth.ts src/lib/freelandoo/auth.test.ts src/app/api/freelandoo
git commit -m "feat(freelandoo): auth valida token do banco com fallback env"
```

---

### Task 4: Rota `/api/settings/freelandoo-token` (ADMIN)

**Files:**
- Create: `src/app/api/settings/freelandoo-token/route.ts`

Rotas ficam finas (lógica já testada na lib — padrão do repo: testes em `src/lib`, rotas verificadas por curl na Task 6). O proxy de sessão já bloqueia não-logados em `/api/settings/*` (não está em `PUBLIC_PREFIXES`).

- [ ] **Step 1: Criar a rota**

`src/app/api/settings/freelandoo-token/route.ts`:

```ts
import { NextResponse } from "next/server";
import { exigirSessaoApi } from "@/lib/auth/api-guard";
import { podePapel, type Papel } from "@/lib/auth/rbac";
import { gerarTokenFreelandoo, statusTokenFreelandoo } from "@/lib/freelandoo/token";

async function exigirAdmin() {
  const g = await exigirSessaoApi();
  if (g.erro || !g.user) {
    return { user: null as null, erro: g.erro ?? NextResponse.json({ erro: "não autenticado" }, { status: 401 }) };
  }
  if (!podePapel(g.user.role as Papel, ["ADMIN"])) {
    return { user: null as null, erro: NextResponse.json({ erro: "apenas ADMIN" }, { status: 403 }) };
  }
  return { user: g.user, erro: null as null };
}

export async function GET() {
  const g = await exigirAdmin();
  if (g.erro || !g.user) return g.erro!;
  return NextResponse.json(await statusTokenFreelandoo());
}

export async function POST() {
  const g = await exigirAdmin();
  if (g.erro || !g.user) return g.erro!;
  const token = await gerarTokenFreelandoo(g.user.id);
  return NextResponse.json({ token });
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/app/api/settings/freelandoo-token/route.ts`
Expected: sem output (limpo).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/freelandoo-token
git commit -m "feat(freelandoo): rota ADMIN para gerar/rotacionar token pelo painel"
```

---

### Task 5: Card "Integração Freelandoo" no painel

**Files:**
- Create: `src/components/painel/FreelandooTokenCard.tsx`
- Modify: `src/app/(app)/painel/page.tsx` (imports + seção no fim, antes do `</>`)

- [ ] **Step 1: Criar o client component**

`src/components/painel/FreelandooTokenCard.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import type { StatusTokenFreelandoo } from "@/lib/freelandoo/token";

function fmtData(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function FreelandooTokenCard({ inicial }: { inicial: StatusTokenFreelandoo }) {
  const [status, setStatus] = useState(inicial);
  const [token, setToken] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    setErro(""); setGerando(true); setConfirmando(false); setCopiado(false);
    const r = await fetch("/api/settings/freelandoo-token", { method: "POST" });
    if (!r.ok) { setErro("Falha ao gerar o token"); setGerando(false); return; }
    const d = (await r.json()) as { token: string };
    setToken(d.token);
    setStatus({ exists: true, createdAt: new Date().toISOString(), createdByNome: status.createdByNome, lastUsedAt: null });
    setGerando(false);
  }

  async function copiar() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopiado(true);
  }

  const btnCls =
    "rounded-lg bg-red px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-widest " +
    "text-white transition-colors hover:bg-red-bright disabled:opacity-60";

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          Integração Freelandoo
        </h3>
        {status.exists
          ? <Badge tone="ok">Token ativo</Badge>
          : <Badge>Nunca gerado</Badge>}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Token Bearer que a Freelandoo usa para consumir a API da academia
        (membros, acessos e pagamentos).
      </p>

      {status.exists && !token && (
        <p className="mt-3 text-xs text-faint">
          Gerado em {fmtData(status.createdAt)} · último uso: {fmtData(status.lastUsedAt)}
        </p>
      )}

      {token && (
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-4">
          <p className="text-xs font-medium uppercase tracking-widest text-warn">
            Copie agora — este token não será mostrado de novo
          </p>
          <code className="mt-2 block break-all font-mono text-sm text-ink">{token}</code>
          <button type="button" onClick={copiar} className={`mt-3 ${btnCls}`}>
            {copiado ? "Copiado ✓" : "Copiar token"}
          </button>
        </div>
      )}

      {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

      {!token && (
        <div className="mt-4 flex items-center gap-3">
          {status.exists && !confirmando ? (
            <button type="button" onClick={() => setConfirmando(true)} className={btnCls}>
              Rotacionar token
            </button>
          ) : status.exists && confirmando ? (
            <>
              <button type="button" onClick={gerar} disabled={gerando} className={btnCls}>
                {gerando ? "Gerando…" : "Confirmar rotação"}
              </button>
              <button type="button" onClick={() => setConfirmando(false)}
                className="text-xs text-muted transition-colors hover:text-ink">
                Cancelar
              </button>
              <p className="text-xs text-warn">
                O token atual para de valer na hora — a integração fica fora até você colar o novo na Freelandoo.
              </p>
            </>
          ) : (
            <button type="button" onClick={gerar} disabled={gerando} className={btnCls}>
              {gerando ? "Gerando…" : "Gerar token"}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Integrar no painel (só ADMIN)**

Em `src/app/(app)/painel/page.tsx` — imports novos no topo:

```tsx
import { usuarioAtual } from "@/lib/auth/session";
import { statusTokenFreelandoo } from "@/lib/freelandoo/token";
import { FreelandooTokenCard } from "@/components/painel/FreelandooTokenCard";
```

No início do componente, junto do `Promise.all` existente (linha ~10), buscar o usuário:

```tsx
  const user = await usuarioAtual();
```

E antes do fechamento `</>` (depois da seção "Atenção imediata", linha ~137), a nova seção:

```tsx
      {user?.role === "ADMIN" && (
        <Reveal delay={0.2}>
          <section className="mt-10">
            <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-widest text-faint">
              Integrações
            </h2>
            <FreelandooTokenCard inicial={await statusTokenFreelandoo()} />
          </section>
        </Reveal>
      )}
```

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/painel/FreelandooTokenCard.tsx "src/app/(app)/painel/page.tsx"`
Expected: sem output (limpo).

- [ ] **Step 4: Commit**

```bash
git add src/components/painel/FreelandooTokenCard.tsx "src/app/(app)/painel/page.tsx"
git commit -m "feat(painel): card ADMIN para gerar/rotacionar token da Freelandoo"
```

---

### Task 6: Verificação de ponta a ponta

- [ ] **Step 1: Suíte completa + lint geral**

Run: `npm run test` → tudo verde.
Run: `npx eslint src` → limpo.

- [ ] **Step 2: Subir o dev server (background)**

Run: `npm run dev` (background). Aguardar `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000` responder 200.

- [ ] **Step 3: Fluxo real via curl (credenciais do seed em `prisma/seed.ts`: `alex.rodriguus@gmail.com` / `coliseu123`)**

```bash
# login → cookie
curl -s -i -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"alex.rodriguus@gmail.com","senha":"coliseu123"}' | grep -i set-cookie
# usar o coliseu_session=... abaixo como $COOKIE

# status antes (pode ser exists:false)
curl -s -H "Cookie: $COOKIE" http://localhost:3000/api/settings/freelandoo-token

# gerar token
curl -s -X POST -H "Cookie: $COOKIE" http://localhost:3000/api/settings/freelandoo-token
# guardar o token retornado como $TOKEN

# novo token autentica (400 = passou da auth, faltou parâmetro)
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/freelandoo/member?email=x@x.com"   # esperado: 400

# token antigo da env agora é rejeitado (banco tem precedência)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer 70b8695cc21a0a04dbacd9278f88ac54637129d8bfc8bbe90111e9d333832083" \
  "http://localhost:3000/api/freelandoo/member?email=x@x.com"   # esperado: 401

# sem sessão: proxy bloqueia a rota de settings
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/settings/freelandoo-token  # esperado: 401
```

- [ ] **Step 4: Verificação visual (usuário)**

Abrir http://localhost:3000/painel logado como ADMIN: card "Integração Freelandoo" no fim, badge "Token ativo", rotação pede confirmação, token aparece uma vez com copiar.

- [ ] **Step 5: Commit final (se houver ajustes) e atualizar `DEPLOY.md`**

Em `DEPLOY.md` linha 30, complementar a linha da env:

```markdown
- `FREELANDOO_API_TOKEN` — fallback; a partir da Fase de painel o token é gerado/rotacionado pelo card "Integração Freelandoo" (tabela ApiToken tem precedência)
```

```bash
git add DEPLOY.md
git commit -m "docs(deploy): token Freelandoo agora rotacionavel pelo painel"
```
