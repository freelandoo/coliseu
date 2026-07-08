# Token da API Freelandoo gerado pelo painel

**Data:** 2026-07-08
**Status:** aprovado

## Problema

A Gym Provider API (`/api/freelandoo/*`) é autenticada por Bearer token vindo da
env `FREELANDOO_API_TOKEN`. Gerar ou rotacionar o token exige editar o ambiente
do servidor e reiniciar/redeployar. O admin precisa conseguir gerar e rotacionar
o token pelo próprio painel, sem tocar no servidor.

## Decisões (com o usuário)

- **Permissão:** só `ADMIN` vê o card e pode gerar/rotacionar.
- **Exibição:** o token em claro aparece **uma única vez** ao gerar; no banco
  fica apenas o hash SHA-256. Perdeu → rotaciona.
- **Abordagem:** tabela dedicada `ApiToken` no banco (não campo em `Unit`,
  não env-only).

## Design

### 1. Dados

Novo model Prisma:

```prisma
model ApiToken {
  id          String    @id @default(cuid())
  provider    String    @unique // "freelandoo"
  tokenHash   String    // sha256 hex do token em claro
  createdAt   DateTime  @default(now())
  createdBy   User      @relation(fields: [createdById], references: [id])
  createdById String
  lastUsedAt  DateTime?
}
```

Um token ativo por provider: rotacionar faz upsert do hash — o token anterior
deixa de valer imediatamente. Requer migration (`prisma migrate dev`; parar o
dev server antes, por causa do lock de DLL do Prisma no Windows).

### 2. API interna — `/api/settings/freelandoo-token`

Rota protegida por sessão (proxy) + checagem de `role === ADMIN` no handler
(403 caso contrário).

- **POST** — gera `randomBytes(32).toString("hex")` (64 chars), grava
  `sha256(token)` via upsert por provider, registra `AuditLog`
  (`actorType: "USER"`, `actorId`, `action: "freelandoo_token.rotate"`,
  `entity: "ApiToken"`, `before`/`after` só com metadados — nunca hash nem
  token) e responde `{ token }` — única vez que o valor em claro existe fora
  da memória.
- **GET** — status para o card: `{ exists, createdAt, createdByNome,
  lastUsedAt }`. Nunca retorna hash nem token.

### 3. Validação do lado Freelandoo (`exigirFreelandoo`)

Passa a ser assíncrona:

1. Busca `ApiToken` do provider `"freelandoo"`.
2. Se existe → compara `sha256(bearer)` vs `tokenHash` com `timingSafeEqual`
   (constant-time, como hoje) e atualiza `lastUsedAt` (best-effort, não
   bloqueia a resposta).
3. Se **não** existe registro → comportamento atual inalterado: valida contra
   a env `FREELANDOO_API_TOKEN`; em dev sem env, libera; em produção sem env,
   503.

Consequência: produção continua funcionando com a env até o primeiro token ser
gerado pelo painel; a partir daí o banco tem precedência. Os três handlers
(`member`, `access-events`, `payments`) passam a `await exigirFreelandoo(req)`.

### 4. UI — card "Integração Freelandoo" no painel

No fim de `src/app/(app)/painel/page.tsx`, renderizado só quando
`usuarioAtual()` retorna `role === ADMIN`. Client component para o fluxo
interativo, seguindo os primitivos existentes (`Card`, `Badge`, `Reveal`).

Estados:

- **Nunca gerado** — texto explicativo + botão "Gerar token".
- **Ativo** — "ativo desde {createdAt} · último uso {lastUsedAt|nunca}" +
  botão "Rotacionar token" com confirmação explícita (rotacionar quebra a
  integração até o novo valor ser colado na Freelandoo).
- **Recém-gerado** — token em claro exibido uma vez, botão copiar, aviso de
  que não será mostrado novamente.

### 5. Testes (Vitest)

- `exigirFreelandoo`: token do banco válido → passa; inválido → 401; sem
  registro + env válida → passa (fallback); dev sem nada → libera; produção
  sem nada → 503.
- Endpoint: RECEPCAO/TECNICO → 403; ADMIN → 200 com token de 64 hex; rotação
  invalida o token anterior; AuditLog gravado.

## Fora de escopo (YAGNI)

Múltiplos tokens simultâneos, expiração automática, escopos por endpoint,
tokens para outros providers (o model já comporta via `provider`, mas nada de
UI/rotas genéricas agora).
