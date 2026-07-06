# Catraca — Fase 1 (Fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o store em memória (`globalThis`) por PostgreSQL + Prisma com repositórios, adicionar autenticação por sessão + RBAC, e fazer o `/painel` ler dados reais — sem quebrar telas nem mudar a identidade visual.

**Architecture:** `store.ts` vira uma **fachada assíncrona** sobre `src/lib/repositories/*` (Prisma). As funções que hoje retornam `T` passam a retornar `Promise<T>`; os Server Components (já async-capáveis) e as rotas `/api` passam a `await`. `mock-data.ts` vira `prisma/seed.ts`. Auth por sessão com cookie httpOnly + RBAC por papel (ADMIN/RECEPCAO/TECNICO). Escopo restrito à Fundação — o domínio de acesso/catraca é de fases posteriores.

**Tech Stack:** Next.js 16 (App Router, runtime nodejs), React 19, TypeScript, **Prisma + PostgreSQL** (Docker), **Vitest** (harness de testes novo), `@node-rs/argon2` para hash de senha, `jose` para tokens de sessão.

**Contexto do repositório (ler antes de começar):**
- Não há framework de teste hoje. Esta fase **introduz o Vitest** (Task 2).
- O `store.ts` exporta 23 funções **síncronas** (arrays em `globalThis`). Todas viram `async`. Consumidores conhecidos a atualizar (todos Server Components ou rotas, já podem `await`): `src/app/(app)/painel/page.tsx`, `matricula/page.tsx`, `cobranca/page.tsx`, `retencao/page.tsx`, `relatorios/page.tsx`, `clientes/page.tsx`, `clientes/[id]/page.tsx`, `custos/page.tsx`, `captacao/page.tsx`, e as rotas `src/app/api/pessoas/route.ts`, `pessoas/[id]/route.ts`, `despesas/route.ts`, `despesas/[id]/route.ts`, `planos/route.ts`, `planos/[id]/route.ts`, `webhooks/asaas/route.ts`.
- Prisma exige runtime `nodejs` (default do Next 16 — não usar edge nessas rotas).
- Antes de escrever qualquer código que toque em convenções do Next 16, consultar `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` e `.../15-route-handlers.md`.
- **Não** ler/expor `.env.local`. Segredos só via env.

---

## Estrutura de arquivos (Fase 1)

**Novos:**
- `prisma/schema.prisma` — modelos da Fase 1 (Unit, Role, User, Person, Plan, Membership, Payment, Despesa, Session).
- `prisma/seed.ts` — seed determinístico (migra `mock-data.ts`).
- `src/lib/db.ts` — singleton do PrismaClient.
- `src/lib/repositories/pessoas.ts`, `planos.ts`, `cobrancas.ts`, `despesas.ts` — acesso a dados.
- `src/lib/repositories/mappers.ts` — Prisma row → tipos de domínio atuais (`Pessoa`, `Plano`, …).
- `src/lib/auth/password.ts` — hash/verify.
- `src/lib/auth/session.ts` — criar/ler/destruir sessão (cookie).
- `src/lib/auth/rbac.ts` — `requireUser`, `requireRole`.
- `src/app/login/page.tsx` + `src/app/api/auth/login/route.ts` + `logout/route.ts`.
- `src/middleware.ts` — protege rotas app e `/api` (exceto login e webhook).
- `vitest.config.ts`, `src/lib/**/*.test.ts`.

**Alterados:**
- `docker-compose.yml` — serviço `db` (Postgres) + `DATABASE_URL`.
- `.env.example` — `DATABASE_URL`, `AUTH_SECRET`.
- `package.json` — deps + scripts (`db:*`, `test`, `seed`).
- `src/lib/store.ts` — vira fachada async.
- Todos os consumidores listados acima — `await` nas chamadas.
- `src/app/(app)/painel/page.tsx` — sai do `mock-data`.
- `src/lib/mock-data.ts` — mantém só helpers puros (`formatBRL`, `formatData`, `diasEntre`, `HOJE`, `diasSemPresenca`, `faixaAusencia`, `serieMensal`, `precisaRenovar`); os arrays semente migram para `prisma/seed.ts`.

---

## Task 1: Postgres via Docker + variáveis de ambiente

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Create: `.env.local` (append — NÃO commitar; já é gitignored)

- [ ] **Step 1: Adicionar o serviço `db` ao `docker-compose.yml`**

Substitua o conteúdo de `docker-compose.yml` por:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: coliseu
      POSTGRES_PASSWORD: coliseu_dev
      POSTGRES_DB: coliseu
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data

  web:
    build: .
    depends_on:
      - db
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
      - /app/.next
    environment:
      - WATCHPACK_POLLING=true
      - NEXT_TELEMETRY_DISABLED=1
      - DATABASE_URL=postgresql://coliseu:coliseu_dev@db:5432/coliseu?schema=public
    # env_file:
    #   - .env.local

volumes:
  db_data:
```

- [ ] **Step 2: Documentar as variáveis em `.env.example`**

Adicione ao final de `.env.example`:

```bash
# Banco (Postgres). Local (fora do docker) usa localhost; dentro do compose use host "db".
DATABASE_URL=postgresql://coliseu:coliseu_dev@localhost:5432/coliseu?schema=public
# Segredo para assinar sessões (gere com: openssl rand -base64 32)
AUTH_SECRET=
```

- [ ] **Step 3: Definir as variáveis no `.env.local`** (não commitar)

Acrescente ao seu `.env.local` (o arquivo é gitignored):

```bash
DATABASE_URL=postgresql://coliseu:coliseu_dev@localhost:5432/coliseu?schema=public
AUTH_SECRET=troque-por-openssl-rand-base64-32
```

- [ ] **Step 4: Subir o Postgres e verificar**

Run:
```bash
docker compose up -d db
docker compose exec db pg_isready -U coliseu
```
Expected: `... accepting connections`.

- [ ] **Step 5: Commit** (sem `.env.local`)

```bash
git add docker-compose.yml .env.example
git commit -m "chore(db): serviço Postgres no docker-compose + DATABASE_URL"
```

---

## Task 2: Instalar Prisma + Vitest e configurar scripts

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar dependências**

Run:
```bash
npm i @prisma/client @node-rs/argon2 jose
npm i -D prisma vitest
```
Expected: instala sem erros; `prisma` e `vitest` em devDependencies.

- [ ] **Step 2: Inicializar o Prisma**

Run:
```bash
npx prisma init --datasource-provider postgresql
```
Expected: cria `prisma/schema.prisma` e adiciona `DATABASE_URL` ao `.env` (pode apagar o `.env` gerado se preferir usar só `.env.local`; o Prisma CLI lê `.env` e `.env.local`).

- [ ] **Step 3: Adicionar scripts ao `package.json`**

No bloco `"scripts"`, adicione:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset --force"
```

E adicione o bloco de seed do Prisma no topo do `package.json` (fora de scripts):

```json
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
```

Instale o runner de TS para o seed:
```bash
npm i -D tsx
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 5: Teste de fumaça do harness**

Crie `src/lib/__smoke.test.ts`:
```ts
import { expect, test } from "vitest";
test("harness ok", () => {
  expect(1 + 1).toBe(2);
});
```
Run: `npm test`
Expected: 1 passed. Depois **apague** o arquivo de fumaça.

- [ ] **Step 6: Commit**

```bash
rm src/lib/__smoke.test.ts
git add package.json package-lock.json vitest.config.ts prisma/schema.prisma
git commit -m "chore: Prisma + Vitest + scripts de banco/teste"
```

---

## Task 3: Schema Prisma da Fase 1

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Escrever o schema**

Substitua `prisma/schema.prisma` por:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  RECEPCAO
  TECNICO
}

enum Origem {
  whatsapp
  redes
  balcao
  indicacao
}

enum PessoaFase {
  lead
  aluno
}

enum LeadEstagio {
  novo
  qualificado
  interesse
  perdido
  convertido
}

enum MembershipStatus {
  DRAFT
  PENDING_PAYMENT
  ACTIVE
  SUSPENDED
  CANCELED
  EXPIRED
}

enum CobrancaStatus {
  pendente
  pago
  atrasado
}

enum CobrancaTipo {
  matricula
  mensalidade
  renovacao
}

model Unit {
  id        String   @id @default(cuid())
  slug      String   @unique
  nome      String
  createdAt DateTime @default(now())
  users     User[]
  people    Person[]
  plans     Plan[]
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  nome         String
  passwordHash String
  role         Role     @default(RECEPCAO)
  unit         Unit     @relation(fields: [unitId], references: [id])
  unitId       String
  createdAt    DateTime @default(now())
  sessions     Session[]
}

model Session {
  id        String   @id @default(cuid())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
}

model Person {
  id             String       @id @default(cuid())
  codigo         String       @unique
  nome           String
  telefone       String?
  email          String?
  cpf            String?
  origem         Origem
  fase           PessoaFase   @default(lead)
  estagio        LeadEstagio?
  motivoPerdido  String?
  dataNascimento String?
  // endereço achatado (igual ao domínio atual)
  cep     String?
  estado  String?
  cidade  String?
  rua     String?
  numero  String?
  criadoEm DateTime @default(now())

  unit   Unit   @relation(fields: [unitId], references: [id])
  unitId String

  memberships Membership[]
  cobrancas   Cobranca[]

  @@index([unitId, fase])
  @@index([nome])
}

model Plan {
  id           String  @id @default(cuid())
  nome         String
  valorMensal  Float
  duracaoMeses Int
  ativo        Boolean @default(true)
  descricao    String?

  unit   Unit   @relation(fields: [unitId], references: [id])
  unitId String

  memberships Membership[]

  @@index([unitId, ativo])
}

model Membership {
  id                  String           @id @default(cuid())
  person              Person           @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId            String
  plan                Plan             @relation(fields: [planId], references: [id])
  planId              String
  status              MembershipStatus @default(DRAFT)
  matriculadoEm       DateTime         @default(now())
  vencimentoPlano     DateTime
  ultimaPresenca      DateTime         @default(now())
  courtesyEntriesLeft Int              @default(1)

  @@index([personId, status])
}

model Cobranca {
  id            String         @id @default(cuid())
  person        Person         @relation(fields: [personId], references: [id], onDelete: Cascade)
  personId      String
  tipo          CobrancaTipo
  valor         Float
  vencimento    DateTime
  status        CobrancaStatus @default(pendente)
  asaasId       String?
  assinaturaId  String?
  linkPagamento String?

  @@index([personId, status])
  @@index([asaasId])
}

model Despesa {
  id         String   @id @default(cuid())
  categoria  String
  descricao  String?
  valor      Float
  data       DateTime
  recorrente Boolean  @default(false)
}
```

- [ ] **Step 2: Criar a migração inicial**

Run:
```bash
npx prisma migrate dev --name init_fase1
```
Expected: cria `prisma/migrations/*_init_fase1/` e aplica no Postgres; gera o client.

- [ ] **Step 3: Verificar as tabelas**

Run:
```bash
docker compose exec db psql -U coliseu -d coliseu -c "\dt"
```
Expected: lista `Unit, User, Session, Person, Plan, Membership, Cobranca, Despesa`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): schema Prisma da Fase 1 (unidade, auth, pessoa, plano, membership, cobrança, despesa)"
```

---

## Task 4: Singleton do Prisma Client

**Files:**
- Create: `src/lib/db.ts`
- Test: `src/lib/db.test.ts`

- [ ] **Step 1: Escrever o teste (conecta e conta)**

`src/lib/db.test.ts`:
```ts
import { expect, test } from "vitest";
import { prisma } from "@/lib/db";

test("prisma conecta e consulta", async () => {
  const n = await prisma.unit.count();
  expect(typeof n).toBe("number");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/db.test.ts`
Expected: FALHA (`@/lib/db` não existe).

- [ ] **Step 3: Implementar o singleton**

`src/lib/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  g.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") g.__prisma = prisma;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/db.test.ts`
Expected: PASS (precisa do Postgres no ar — `docker compose up -d db`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/lib/db.test.ts
git commit -m "feat(db): singleton do Prisma Client"
```

---

## Task 5: Seed a partir do mock-data

**Files:**
- Create: `prisma/seed.ts`
- Modify: `src/lib/mock-data.ts` (remover arrays semente; manter helpers puros)

- [ ] **Step 1: Escrever `prisma/seed.ts`**

O seed cria a unidade, um usuário ADMIN, os 4 planos, e converte os leads/alunos/cobranças/despesas dos mocks. Use os mesmos valores de `mock-data.ts`.

```ts
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

// Data de referência determinística (igual ao mock atual).
const HOJE = new Date("2026-06-28T12:00:00-03:00");
function offset(days: number): Date {
  const d = new Date(HOJE);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  const unit = await prisma.unit.upsert({
    where: { slug: "coliseu-team" },
    update: {},
    create: { slug: "coliseu-team", nome: "Academia Coliseu Team" },
  });

  await prisma.user.upsert({
    where: { email: "admin@coliseu.local" },
    update: {},
    create: {
      email: "admin@coliseu.local",
      nome: "Administrador",
      passwordHash: await hash("coliseu123"),
      role: "ADMIN",
      unitId: unit.id,
    },
  });

  const planosSeed = [
    { id: "p-mensal", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1 },
    { id: "p-tri", nome: "Trimestral", valorMensal: 109.9, duracaoMeses: 3 },
    { id: "p-semestral", nome: "Semestral", valorMensal: 94.9, duracaoMeses: 6 },
    { id: "p-anual", nome: "Anual", valorMensal: 79.9, duracaoMeses: 12 },
  ];
  for (const p of planosSeed) {
    await prisma.plan.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, ativo: true, unitId: unit.id },
    });
  }

  // Alunos semente → Person(fase aluno) + Membership + (cobranças abaixo).
  const alunos = [
    { id: "a-01", codigo: "CD00001", nome: "Pedro Henrique", telefone: "(11) 98123-4507", email: "pedro@email.com", cpf: "312.456.789-01", planoId: "p-anual", status: "ACTIVE", matric: -9, venc: 356, pres: -1, origem: "indicacao" },
    { id: "a-02", codigo: "CD00002", nome: "Juliana Castro", telefone: "(11) 98123-4510", email: "juliana@email.com", cpf: "423.567.890-12", planoId: "p-mensal", status: "ACTIVE", matric: -20, venc: 10, pres: 0, origem: "balcao" },
    { id: "a-03", codigo: "CD00003", nome: "Anderson Pinto", telefone: "(11) 98123-4511", email: "anderson@email.com", cpf: "534.678.901-23", planoId: "p-tri", status: "PENDING_PAYMENT", matric: -1, venc: 89, pres: -1, origem: "balcao" },
    { id: "a-04", codigo: "CD00004", nome: "Fernanda Melo", telefone: "(11) 98123-4512", email: "fernanda@email.com", cpf: "645.789.012-34", planoId: "p-mensal", status: "ACTIVE", matric: -65, venc: -5, pres: -9, origem: "balcao" },
    { id: "a-05", codigo: "CD00005", nome: "Lucas Ferreira", telefone: "(11) 98123-4513", email: "lucas@email.com", cpf: "756.890.123-45", planoId: "p-semestral", status: "ACTIVE", matric: -40, venc: 140, pres: -8, origem: "balcao" },
    { id: "a-06", codigo: "CD00006", nome: "Patrícia Gomes", telefone: "(11) 98123-4514", email: "patricia@email.com", cpf: "867.901.234-56", planoId: "p-mensal", status: "ACTIVE", matric: -33, venc: 3, pres: -15, origem: "balcao" },
    { id: "a-07", codigo: "CD00007", nome: "Rodrigo Barros", telefone: "(11) 98123-4515", email: "rodrigo@email.com", cpf: "978.012.345-67", planoId: "p-tri", status: "ACTIVE", matric: -80, venc: 10, pres: -22, origem: "balcao" },
    { id: "a-08", codigo: "CD00008", nome: "Aline Cardoso", telefone: "(11) 98123-4516", email: "aline@email.com", cpf: "089.123.456-78", planoId: "p-mensal", status: "ACTIVE", matric: -95, venc: -12, pres: -30, origem: "balcao" },
  ] as const;

  for (const a of alunos) {
    const person = await prisma.person.upsert({
      where: { codigo: a.codigo },
      update: {},
      create: {
        codigo: a.codigo, nome: a.nome, telefone: a.telefone, email: a.email,
        cpf: a.cpf, origem: a.origem, fase: "aluno", unitId: unit.id,
        criadoEm: offset(a.matric),
      },
    });
    await prisma.membership.create({
      data: {
        personId: person.id, planId: a.planoId,
        status: a.status as never,
        matriculadoEm: offset(a.matric),
        vencimentoPlano: offset(a.venc),
        ultimaPresenca: offset(a.pres),
      },
    });
  }

  // Leads em aberto (não convertidos/perdidos viram Person fase lead).
  const leads = [
    { codigo: "CD09001", nome: "Marina Alves", telefone: "(11) 98123-4501", origem: "whatsapp", estagio: "novo", criado: -1 },
    { codigo: "CD09002", nome: "Diego Martins", telefone: "(11) 98123-4502", origem: "indicacao", estagio: "novo", criado: 0 },
    { codigo: "CD09003", nome: "Rafael Souza", telefone: "(11) 98123-4503", origem: "redes", estagio: "qualificado", criado: -2 },
    { codigo: "CD09004", nome: "Bianca Lima", telefone: "(11) 98123-4504", origem: "balcao", estagio: "qualificado", criado: -3 },
    { codigo: "CD09005", nome: "Thiago Nunes", telefone: "(11) 98123-4505", origem: "whatsapp", estagio: "interesse", criado: -4 },
    { codigo: "CD09006", nome: "Camila Rocha", telefone: "(11) 98123-4506", origem: "redes", estagio: "interesse", criado: -5 },
  ] as const;
  for (const l of leads) {
    await prisma.person.upsert({
      where: { codigo: l.codigo },
      update: {},
      create: {
        codigo: l.codigo, nome: l.nome, telefone: l.telefone, origem: l.origem,
        fase: "lead", estagio: l.estagio as never, unitId: unit.id, criadoEm: offset(l.criado),
      },
    });
  }

  // Cobranças semente (ligadas aos alunos pelo código).
  const cobrancas = [
    { codigo: "CD00001", tipo: "matricula", valor: 79.9, venc: -9, status: "pago", asaasId: "pay_001" },
    { codigo: "CD00002", tipo: "mensalidade", valor: 129.9, venc: 2, status: "pendente", asaasId: "pay_002", link: "https://asaas.com/c/pay_002" },
    { codigo: "CD00003", tipo: "matricula", valor: 109.9, venc: 1, status: "pendente", asaasId: null, link: "https://asaas.com/c/pay_003" },
    { codigo: "CD00004", tipo: "mensalidade", valor: 129.9, venc: -5, status: "atrasado", asaasId: "pay_004" },
    { codigo: "CD00006", tipo: "mensalidade", valor: 129.9, venc: 3, status: "pendente", asaasId: "pay_006", link: "https://asaas.com/c/pay_006" },
    { codigo: "CD00008", tipo: "mensalidade", valor: 129.9, venc: -12, status: "atrasado", asaasId: "pay_008" },
    { codigo: "CD00005", tipo: "mensalidade", valor: 94.9, venc: 8, status: "pendente", asaasId: "pay_005", link: "https://asaas.com/c/pay_005" },
  ] as const;
  for (const c of cobrancas) {
    const person = await prisma.person.findUnique({ where: { codigo: c.codigo } });
    if (!person) continue;
    await prisma.cobranca.create({
      data: {
        personId: person.id, tipo: c.tipo as never, valor: c.valor,
        vencimento: offset(c.venc), status: c.status as never,
        asaasId: c.asaasId ?? undefined, linkPagamento: c.link ?? undefined,
      },
    });
  }

  const despesas = [
    { categoria: "Luz", valor: 320, data: "2026-07-05", recorrente: false },
    { categoria: "Água", valor: 140, data: "2026-07-05", recorrente: false },
    { categoria: "Internet", valor: 150, data: "2026-07-03", recorrente: true },
  ];
  for (const d of despesas) {
    await prisma.despesa.create({
      data: { categoria: d.categoria, valor: d.valor, data: new Date(d.data), recorrente: d.recorrente },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Rodar o seed**

Run:
```bash
npm run db:seed
```
Expected: sem erros. Verifique:
```bash
docker compose exec db psql -U coliseu -d coliseu -c "select count(*) from \"Person\"; select count(*) from \"Plan\";"
```
Expected: 14 pessoas (8 alunos + 6 leads), 4 planos.

- [ ] **Step 3: Enxugar `mock-data.ts`** (remover só os arrays semente; manter helpers)

Remova de `src/lib/mock-data.ts` os `export const planosSeed`, `export const leads`, `export const alunos`, `export const cobrancas` (agora vivem no seed). **Mantenha** `HOJE`, `isoOffsetDays`, `formatBRL`, `formatData`, `diasEntre`, `diasSemPresenca`, `faixaAusencia`, `precisaRenovar`, `serieMensal` e demais funções puras. Se `serieMensal`/`precisaRenovar` referenciarem os arrays removidos, ajuste-os para receber os dados por parâmetro (serão chamados pelos repositórios na Task 8/9).

> Nota: o `store.ts` ainda importa esses arrays — ele será reescrito na Task 10-12, então é esperado que o typecheck falhe temporariamente até lá. Não commite este passo sozinho; ele fecha junto com a fachada.

- [ ] **Step 4: Commit** (só o seed; o mock-data fecha com a fachada)

```bash
git add prisma/seed.ts
git commit -m "feat(db): seed determinístico a partir dos mocks (unidade, admin, planos, pessoas, cobranças, despesas)"
```

---

## Task 6: Mappers (Prisma → tipos de domínio)

**Files:**
- Create: `src/lib/repositories/mappers.ts`
- Test: `src/lib/repositories/mappers.test.ts`

- [ ] **Step 1: Teste dos mappers**

`src/lib/repositories/mappers.test.ts`:
```ts
import { expect, test } from "vitest";
import { toPlano } from "@/lib/repositories/mappers";

test("toPlano mapeia row do Prisma para Plano de domínio", () => {
  const row = { id: "p1", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1, ativo: true, descricao: null, unitId: "u1" };
  const plano = toPlano(row as never);
  expect(plano).toEqual({ id: "p1", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1, ativo: true, descricao: undefined });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/repositories/mappers.test.ts`
Expected: FALHA (arquivo não existe).

- [ ] **Step 3: Implementar os mappers**

`src/lib/repositories/mappers.ts` — converte rows do Prisma para os tipos atuais de `@/lib/types` (`Plano`, `Pessoa`, `Aluno`, `Lead`, `Cobranca`, `Despesa`). Membership+Person compõem `Pessoa`/`Aluno`.

```ts
import type { Plano, Pessoa, Cobranca, Despesa } from "@/lib/types";
import type {
  Plan as PPlan,
  Person as PPerson,
  Membership as PMembership,
  Cobranca as PCobranca,
  Despesa as PDespesa,
} from "@prisma/client";

export function toPlano(p: PPlan): Plano {
  return {
    id: p.id,
    nome: p.nome,
    valorMensal: p.valorMensal,
    duracaoMeses: p.duracaoMeses,
    ativo: p.ativo,
    descricao: p.descricao ?? undefined,
  };
}

export function toPessoa(p: PPerson & { memberships: PMembership[] }): Pessoa {
  const m = p.memberships[0]; // membership vigente (Fase 1: 1 por pessoa)
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    telefone: p.telefone ?? undefined,
    email: p.email ?? undefined,
    cpf: p.cpf ?? undefined,
    origem: p.origem,
    fase: p.fase,
    criadoEm: p.criadoEm.toISOString(),
    estagio: p.estagio ?? undefined,
    motivoPerdido: p.motivoPerdido ?? undefined,
    planoId: m?.planId,
    status: m ? membershipToStatus(m.status) : undefined,
    matriculadoEm: m?.matriculadoEm.toISOString(),
    vencimentoPlano: m?.vencimentoPlano.toISOString(),
    ultimaPresenca: m?.ultimaPresenca.toISOString(),
    dataNascimento: p.dataNascimento ?? undefined,
    endereco:
      p.cep || p.cidade
        ? { cep: p.cep ?? undefined, estado: p.estado ?? undefined, cidade: p.cidade ?? undefined, rua: p.rua ?? undefined, numero: p.numero ?? undefined }
        : undefined,
  };
}

// Mapeia MembershipStatus (novo) para o AlunoStatus legado que as telas usam.
function membershipToStatus(s: PMembership["status"]): Pessoa["status"] {
  switch (s) {
    case "ACTIVE": return "ativo";
    case "PENDING_PAYMENT": return "pendente";
    case "CANCELED": return "cancelado";
    case "SUSPENDED":
    case "EXPIRED":
    default: return "inadimplente";
  }
}

export function toCobranca(c: PCobranca & { person: { id: string } }): Cobranca {
  return {
    id: c.id,
    alunoId: c.personId,
    tipo: c.tipo,
    valor: c.valor,
    vencimento: c.vencimento.toISOString(),
    status: c.status,
    asaasId: c.asaasId ?? null,
    assinaturaId: c.assinaturaId ?? undefined,
    linkPagamento: c.linkPagamento ?? undefined,
  };
}

export function toDespesa(d: PDespesa): Despesa {
  return {
    id: d.id,
    categoria: d.categoria,
    descricao: d.descricao ?? undefined,
    valor: d.valor,
    data: d.data.toISOString(),
    recorrente: d.recorrente,
  };
}
```

> Nota: `membershipToStatus` preserva o contrato legado das telas (`ativo/pendente/inadimplente/cancelado`). A separação real de status entra na Fase 3; aqui só mantemos as telas funcionando.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/repositories/mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/mappers.ts src/lib/repositories/mappers.test.ts
git commit -m "feat(repo): mappers Prisma → tipos de domínio (preserva contrato das telas)"
```

---

## Task 7: Repositório de planos

**Files:**
- Create: `src/lib/repositories/planos.ts`
- Test: `src/lib/repositories/planos.test.ts`

- [ ] **Step 1: Teste de integração (usa o Postgres)**

`src/lib/repositories/planos.test.ts`:
```ts
import { expect, test } from "vitest";
import { listarPlanosRepo, planoPorIdRepo } from "@/lib/repositories/planos";

test("listarPlanosRepo devolve os planos seedados", async () => {
  const planos = await listarPlanosRepo();
  expect(planos.length).toBeGreaterThanOrEqual(4);
  expect(planos.find((p) => p.id === "p-mensal")?.valorMensal).toBe(129.9);
});

test("planoPorIdRepo encontra por id", async () => {
  const p = await planoPorIdRepo("p-anual");
  expect(p?.nome).toBe("Anual");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/repositories/planos.test.ts`
Expected: FALHA (módulo não existe).

- [ ] **Step 3: Implementar o repositório**

`src/lib/repositories/planos.ts`:
```ts
import { prisma } from "@/lib/db";
import { toPlano } from "@/lib/repositories/mappers";
import type { NovoPlano, Plano } from "@/lib/types";

const UNIT_SLUG = "coliseu-team";

async function unitId(): Promise<string> {
  const u = await prisma.unit.findUniqueOrThrow({ where: { slug: UNIT_SLUG } });
  return u.id;
}

export async function listarPlanosRepo(): Promise<Plano[]> {
  const rows = await prisma.plan.findMany({ orderBy: { valorMensal: "desc" } });
  return rows.map(toPlano);
}

export async function planoPorIdRepo(id: string): Promise<Plano | undefined> {
  const row = await prisma.plan.findUnique({ where: { id } });
  return row ? toPlano(row) : undefined;
}

export async function criarPlanoRepo(input: NovoPlano): Promise<Plano> {
  const row = await prisma.plan.create({
    data: {
      nome: input.nome.trim(),
      valorMensal: input.valorMensal,
      duracaoMeses: input.duracaoMeses,
      descricao: input.descricao?.trim() || null,
      ativo: true,
      unitId: await unitId(),
    },
  });
  return toPlano(row);
}

export async function atualizarPlanoRepo(
  id: string,
  patch: Partial<Plano>,
): Promise<Plano | undefined> {
  const exists = await prisma.plan.findUnique({ where: { id } });
  if (!exists) return undefined;
  const row = await prisma.plan.update({
    where: { id },
    data: {
      nome: patch.nome,
      valorMensal: patch.valorMensal,
      duracaoMeses: patch.duracaoMeses,
      ativo: patch.ativo,
      descricao: patch.descricao,
    },
  });
  return toPlano(row);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/repositories/planos.test.ts`
Expected: PASS (Postgres no ar + seed aplicado).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/planos.ts src/lib/repositories/planos.test.ts
git commit -m "feat(repo): repositório de planos (Prisma)"
```

---

## Task 8: Repositório de pessoas (inclui matrícula/membership)

**Files:**
- Create: `src/lib/repositories/pessoas.ts`
- Test: `src/lib/repositories/pessoas.test.ts`

- [ ] **Step 1: Teste**

`src/lib/repositories/pessoas.test.ts`:
```ts
import { expect, test } from "vitest";
import { listarPessoasRepo, criarPessoaRepo, proximoCodigoRepo } from "@/lib/repositories/pessoas";

test("listarPessoasRepo devolve pessoas seedadas", async () => {
  const pessoas = await listarPessoasRepo();
  expect(pessoas.length).toBeGreaterThanOrEqual(14);
});

test("proximoCodigoRepo gera código sequencial CD…", async () => {
  const cod = await proximoCodigoRepo();
  expect(cod).toMatch(/^CD\d{5}$/);
});

test("criarPessoaRepo cria lead com código novo", async () => {
  const p = await criarPessoaRepo({ nome: "Teste Repo", origem: "balcao", telefone: "(11) 90000-0000" });
  expect(p.fase).toBe("lead");
  expect(p.codigo).toMatch(/^CD\d{5}$/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/repositories/pessoas.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar**

`src/lib/repositories/pessoas.ts`:
```ts
import { prisma } from "@/lib/db";
import { toPessoa } from "@/lib/repositories/mappers";
import type { NovaPessoa, Pessoa } from "@/lib/types";

const UNIT_SLUG = "coliseu-team";
const withMemberships = { memberships: { orderBy: { matriculadoEm: "desc" as const }, take: 1 } };

async function unitId(): Promise<string> {
  const u = await prisma.unit.findUniqueOrThrow({ where: { slug: UNIT_SLUG } });
  return u.id;
}

export async function proximoCodigoRepo(): Promise<string> {
  const rows = await prisma.person.findMany({ select: { codigo: true } });
  const maior = rows.reduce((max, r) => {
    const n = Number(r.codigo.replace(/\D/g, "")) || 0;
    return n > max ? n : max;
  }, 0);
  return `CD${String(maior + 1).padStart(5, "0")}`;
}

export async function listarPessoasRepo(): Promise<Pessoa[]> {
  const rows = await prisma.person.findMany({ include: withMemberships, orderBy: { criadoEm: "desc" } });
  return rows.map(toPessoa);
}

export async function obterPessoaRepo(id: string): Promise<Pessoa | undefined> {
  const row = await prisma.person.findUnique({ where: { id }, include: withMemberships });
  return row ? toPessoa(row) : undefined;
}

export async function criarPessoaRepo(input: NovaPessoa): Promise<Pessoa> {
  const row = await prisma.person.create({
    data: {
      codigo: await proximoCodigoRepo(),
      nome: input.nome.trim(),
      telefone: input.telefone?.trim() || null,
      email: input.email?.trim() || null,
      cpf: input.cpf?.trim() || null,
      origem: input.origem,
      fase: "lead",
      estagio: "novo",
      dataNascimento: input.dataNascimento || null,
      cep: input.endereco?.cep || null,
      estado: input.endereco?.estado || null,
      cidade: input.endereco?.cidade || null,
      rua: input.endereco?.rua || null,
      numero: input.endereco?.numero || null,
      unitId: await unitId(),
    },
    include: withMemberships,
  });
  return toPessoa(row);
}

export async function atualizarPessoaRepo(
  id: string,
  patch: Partial<Pessoa>,
): Promise<Pessoa | undefined> {
  const exists = await prisma.person.findUnique({ where: { id } });
  if (!exists) return undefined;
  const row = await prisma.person.update({
    where: { id },
    data: {
      nome: patch.nome,
      telefone: patch.telefone,
      email: patch.email,
      cpf: patch.cpf,
      estagio: patch.estagio,
      motivoPerdido: patch.motivoPerdido,
      dataNascimento: patch.dataNascimento,
      cep: patch.endereco?.cep,
      estado: patch.endereco?.estado,
      cidade: patch.endereco?.cidade,
      rua: patch.endereco?.rua,
      numero: patch.endereco?.numero,
    },
    include: withMemberships,
  });
  return toPessoa(row);
}

export async function removerPessoaRepo(id: string): Promise<boolean> {
  const exists = await prisma.person.findUnique({ where: { id } });
  if (!exists) return false;
  await prisma.person.delete({ where: { id } }); // cascade apaga membership+cobrança
  return true;
}

/** Transição lead → aluno: cria/atualiza Membership + cobrança pendente. */
export async function matricularPessoaRepo(
  id: string,
  planoId: string,
  asaas?: { cobrancaId: string; assinaturaId: string; linkPagamento: string },
): Promise<Pessoa | undefined> {
  const person = await prisma.person.findUnique({ where: { id } });
  const plano = await prisma.plan.findUnique({ where: { id: planoId } });
  if (!person || !plano) return undefined;

  const agora = new Date();
  const venc = new Date(agora);
  venc.setMonth(venc.getMonth() + plano.duracaoMeses);

  await prisma.$transaction([
    prisma.person.update({ where: { id }, data: { fase: "aluno", estagio: null } }),
    prisma.membership.create({
      data: {
        personId: id, planId: planoId, status: "PENDING_PAYMENT",
        matriculadoEm: agora, vencimentoPlano: venc, ultimaPresenca: agora,
      },
    }),
    prisma.cobranca.create({
      data: {
        personId: id, tipo: "matricula", valor: plano.valorMensal,
        vencimento: venc, status: "pendente",
        asaasId: asaas?.cobrancaId ?? null,
        assinaturaId: asaas?.assinaturaId ?? null,
        linkPagamento: asaas?.linkPagamento ?? null,
      },
    }),
  ]);

  return obterPessoaRepo(id);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/repositories/pessoas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/pessoas.ts src/lib/repositories/pessoas.test.ts
git commit -m "feat(repo): repositório de pessoas + matrícula (Prisma)"
```

---

## Task 9: Repositórios de cobranças e despesas

**Files:**
- Create: `src/lib/repositories/cobrancas.ts`, `src/lib/repositories/despesas.ts`
- Test: `src/lib/repositories/financeiro.test.ts`

- [ ] **Step 1: Teste**

`src/lib/repositories/financeiro.test.ts`:
```ts
import { expect, test } from "vitest";
import { listarCobrancasRepo, marcarCobrancaPagaRepo } from "@/lib/repositories/cobrancas";
import { listarDespesasRepo, totalDespesasRepo } from "@/lib/repositories/despesas";

test("listarCobrancasRepo devolve cobranças seedadas", async () => {
  const cs = await listarCobrancasRepo();
  expect(cs.length).toBeGreaterThanOrEqual(7);
});

test("marcarCobrancaPagaRepo marca por asaasId", async () => {
  const ok = await marcarCobrancaPagaRepo("pay_002");
  expect(ok).toBe(true);
});

test("totalDespesasRepo soma as despesas", async () => {
  const total = await totalDespesasRepo();
  expect(total).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/repositories/financeiro.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `cobrancas.ts`**

```ts
import { prisma } from "@/lib/db";
import { toCobranca } from "@/lib/repositories/mappers";
import type { Cobranca } from "@/lib/types";

export async function listarCobrancasRepo(): Promise<Cobranca[]> {
  const rows = await prisma.cobranca.findMany({ include: { person: { select: { id: true } } } });
  return rows.map(toCobranca);
}

export async function marcarCobrancaPagaRepo(asaasId: string): Promise<boolean> {
  const c = await prisma.cobranca.findFirst({ where: { asaasId } });
  if (!c) return false;
  await prisma.$transaction([
    prisma.cobranca.update({ where: { id: c.id }, data: { status: "pago" } }),
    prisma.membership.updateMany({ where: { personId: c.personId }, data: { status: "ACTIVE" } }),
  ]);
  return true;
}

export async function marcarCobrancaAtrasadaRepo(asaasId: string): Promise<boolean> {
  const c = await prisma.cobranca.findFirst({ where: { asaasId } });
  if (!c) return false;
  await prisma.$transaction([
    prisma.cobranca.update({ where: { id: c.id }, data: { status: "atrasado" } }),
    prisma.membership.updateMany({ where: { personId: c.personId }, data: { status: "SUSPENDED" } }),
  ]);
  return true;
}
```

- [ ] **Step 4: Implementar `despesas.ts`**

```ts
import { prisma } from "@/lib/db";
import { toDespesa } from "@/lib/repositories/mappers";
import type { Despesa, NovaDespesa } from "@/lib/types";

export async function listarDespesasRepo(): Promise<Despesa[]> {
  const rows = await prisma.despesa.findMany({ orderBy: { data: "desc" } });
  return rows.map(toDespesa);
}

export async function criarDespesaRepo(input: NovaDespesa): Promise<Despesa> {
  const row = await prisma.despesa.create({
    data: {
      categoria: input.categoria.trim(),
      descricao: input.descricao?.trim() || null,
      valor: input.valor,
      data: input.data ? new Date(input.data) : new Date(),
      recorrente: input.recorrente ?? false,
    },
  });
  return toDespesa(row);
}

export async function removerDespesaRepo(id: string): Promise<boolean> {
  const exists = await prisma.despesa.findUnique({ where: { id } });
  if (!exists) return false;
  await prisma.despesa.delete({ where: { id } });
  return true;
}

export async function totalDespesasRepo(): Promise<number> {
  const rows = await prisma.despesa.findMany({ select: { valor: true } });
  return rows.reduce((s, d) => s + d.valor, 0);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/lib/repositories/financeiro.test.ts`
Expected: PASS. (Reaplique o seed com `npm run db:reset && npm run db:seed` se um teste anterior mutou estado.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/repositories/cobrancas.ts src/lib/repositories/despesas.ts src/lib/repositories/financeiro.test.ts
git commit -m "feat(repo): repositórios de cobranças e despesas (Prisma)"
```

---

## Task 10: Reescrever `store.ts` como fachada assíncrona

**Files:**
- Modify: `src/lib/store.ts` (reescrita completa)

- [ ] **Step 1: Reescrever `store.ts`**

O `store.ts` deixa de ter `globalThis`/arrays e passa a delegar aos repositórios, **mantendo os mesmos nomes** de função (agora `async`). Substitua o arquivo inteiro por:

```ts
// Fachada de dados — delega aos repositórios Prisma.
// As telas e rotas continuam importando estas funções (agora assíncronas).
import {
  listarPlanosRepo, planoPorIdRepo, criarPlanoRepo, atualizarPlanoRepo,
} from "@/lib/repositories/planos";
import {
  listarPessoasRepo, obterPessoaRepo, criarPessoaRepo, atualizarPessoaRepo,
  removerPessoaRepo, matricularPessoaRepo, proximoCodigoRepo,
} from "@/lib/repositories/pessoas";
import {
  listarCobrancasRepo, marcarCobrancaPagaRepo, marcarCobrancaAtrasadaRepo,
} from "@/lib/repositories/cobrancas";
import {
  listarDespesasRepo, criarDespesaRepo, removerDespesaRepo, totalDespesasRepo,
} from "@/lib/repositories/despesas";
import {
  LEAD_ESTAGIO_LABEL, ORIGEM_LABEL,
  type Aluno, type Candidato, type Cobranca, type Despesa, type Lead,
  type NovaDespesa, type NovaPessoa, type NovoPlano, type Pessoa, type Plano,
} from "@/lib/types";
import type { AsaasMatricula } from "@/lib/asaas";
import { diasEntre } from "@/lib/mock-data";

/* ---------- planos ---------- */
export const listarPlanos = (): Promise<Plano[]> => listarPlanosRepo();
export const planoPorId = (id: string): Promise<Plano | undefined> => planoPorIdRepo(id);
export const criarPlano = (input: NovoPlano): Promise<Plano> => criarPlanoRepo(input);
export const atualizarPlano = (id: string, patch: Partial<Plano>): Promise<Plano | undefined> =>
  atualizarPlanoRepo(id, patch);

/* ---------- pessoas ---------- */
export const listarPessoas = (): Promise<Pessoa[]> => listarPessoasRepo();
export const obterPessoa = (id: string): Promise<Pessoa | undefined> => obterPessoaRepo(id);
export const proximoCodigoCadastro = (): Promise<string> => proximoCodigoRepo();
export const criarPessoa = (input: NovaPessoa): Promise<Pessoa> => criarPessoaRepo(input);
export const atualizarPessoa = (id: string, patch: Partial<Pessoa>): Promise<Pessoa | undefined> =>
  atualizarPessoaRepo(id, patch);
export const removerPessoa = (id: string): Promise<boolean> => removerPessoaRepo(id);
export const matricularPessoa = (
  id: string, planoId: string, asaas?: AsaasMatricula,
): Promise<Pessoa | undefined> => matricularPessoaRepo(id, planoId, asaas);

/* ---------- cobranças ---------- */
export const listarCobrancas = (): Promise<Cobranca[]> => listarCobrancasRepo();
export const marcarCobrancaPaga = (asaasId: string): Promise<boolean> => marcarCobrancaPagaRepo(asaasId);
export const marcarCobrancaAtrasada = (asaasId: string): Promise<boolean> => marcarCobrancaAtrasadaRepo(asaasId);

/* ---------- despesas ---------- */
export const listarDespesas = (): Promise<Despesa[]> => listarDespesasRepo();
export const criarDespesa = (input: NovaDespesa): Promise<Despesa> => criarDespesaRepo(input);
export const removerDespesa = (id: string): Promise<boolean> => removerDespesaRepo(id);
export const totalDespesas = (): Promise<number> => totalDespesasRepo();

/* ---------- derivados (compõem a partir dos repositórios) ---------- */
export async function listarAlunos(): Promise<Aluno[]> {
  const pessoas = await listarPessoasRepo();
  return pessoas
    .filter((p) => p.fase === "aluno")
    .map((p) => ({
      id: p.id, codigo: p.codigo, nome: p.nome,
      telefone: p.telefone ?? "", email: p.email ?? "", cpf: p.cpf ?? "",
      planoId: p.planoId ?? "", status: p.status ?? "ativo",
      matriculadoEm: p.matriculadoEm ?? p.criadoEm,
      vencimentoPlano: p.vencimentoPlano ?? p.criadoEm,
      ultimaPresenca: p.ultimaPresenca ?? p.criadoEm,
      dataNascimento: p.dataNascimento,
      cep: p.endereco?.cep, estado: p.endereco?.estado, cidade: p.endereco?.cidade,
      rua: p.endereco?.rua, numero: p.endereco?.numero,
    }));
}

export async function listarLeads(): Promise<Lead[]> {
  const pessoas = await listarPessoasRepo();
  return pessoas
    .filter((p) => p.fase === "lead")
    .map((p) => ({
      id: p.id, nome: p.nome, telefone: p.telefone ?? "",
      origem: p.origem, estagio: p.estagio ?? "novo",
      motivoPerdido: p.motivoPerdido, criadoEm: p.criadoEm,
    }));
}

export async function alunoPorId(id: string): Promise<Aluno | undefined> {
  return (await listarAlunos()).find((a) => a.id === id);
}

export async function receitaRecorrente(): Promise<number> {
  const [pessoas, planos] = await Promise.all([listarPessoasRepo(), listarPlanosRepo()]);
  const byId = new Map(planos.map((p) => [p.id, p]));
  return pessoas
    .filter((p) => p.fase === "aluno" && p.status !== "cancelado")
    .reduce((s, p) => s + (p.planoId ? byId.get(p.planoId)?.valorMensal ?? 0 : 0), 0);
}

export async function candidatosMatricula(): Promise<Candidato[]> {
  const pessoas = await listarPessoasRepo();
  const doLead: Candidato[] = pessoas
    .filter((p) => p.fase === "lead" && ["novo", "qualificado", "interesse"].includes(p.estagio ?? ""))
    .map((p) => ({
      refId: p.id, origem: "lead", nome: p.nome, telefone: p.telefone ?? "",
      email: p.email, cpf: p.cpf, codigo: p.codigo,
      detalhe: `Lead · ${ORIGEM_LABEL[p.origem]} · ${LEAD_ESTAGIO_LABEL[(p.estagio ?? "novo")]}`,
    }));
  const doAluno: Candidato[] = pessoas
    .filter((p) => {
      if (p.fase !== "aluno") return false;
      if (p.status === "inadimplente" || p.status === "cancelado") return true;
      return p.vencimentoPlano ? diasEntre(p.vencimentoPlano) >= -15 : false;
    })
    .map((p) => {
      const dias = p.vencimentoPlano ? diasEntre(p.vencimentoPlano) : 0;
      const situacao = p.status === "inadimplente" ? "inadimplente"
        : p.status === "cancelado" ? "cancelado"
        : dias >= 0 ? `venceu há ${dias}d` : `vence em ${-dias}d`;
      return {
        refId: p.id, origem: "renovacao", nome: p.nome, telefone: p.telefone ?? "",
        email: p.email, cpf: p.cpf, codigo: p.codigo, planoAtualId: p.planoId,
        detalhe: `Renovação · ${situacao}`,
      };
    });
  return [...doLead, ...doAluno];
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: agora aparecem erros **nos consumidores** (chamam funções que viraram `Promise`). Isso é esperado e será resolvido na Task 11. O `store.ts` em si deve compilar.

- [ ] **Step 3: Commit** (fecha junto com o enxugamento do mock-data da Task 5, Step 3)

```bash
git add src/lib/store.ts src/lib/mock-data.ts
git commit -m "refactor(store): fachada assíncrona sobre repositórios Prisma (remove globalThis)"
```

---

## Task 11: Atualizar consumidores para `await`

**Files:**
- Modify: páginas e rotas que chamam o store (lista no cabeçalho do plano).

- [ ] **Step 1: Atualizar as rotas `/api`**

Em cada rota, adicione `await` nas chamadas ao store. Exemplos concretos:

`src/app/api/planos/route.ts` — `listarPlanos()` e `criarPlano(...)` viram `await`:
```ts
export async function GET() {
  return NextResponse.json(await listarPlanos());
}
// ... no POST:
  const plano = await criarPlano({ nome: body.nome, valorMensal, duracaoMeses, descricao: body.descricao });
```

`src/app/api/planos/[id]/route.ts`:
```ts
  const plano = await atualizarPlano(id, patch);
```

`src/app/api/pessoas/route.ts`:
```ts
export async function GET() {
  return NextResponse.json(await listarPessoas());
}
// no POST:
  const pessoa = await criarPessoa(body as NovaPessoa);
```

`src/app/api/pessoas/[id]/route.ts` — `obterPessoa`, `atualizarPessoa`, `planoPorId`, `matricularPessoa`, `removerPessoa` viram `await` (a função já é `async`). Ex.:
```ts
    const pessoaAtual = await obterPessoa(id);
    const plano = await planoPorId(planoId);
    // ...
    const pessoa = await matricularPessoa(id, planoId, asaas);
```

`src/app/api/despesas/route.ts` e `despesas/[id]/route.ts`: `await listarDespesas()`, `await criarDespesa(...)`, `await removerDespesa(id)`.

`src/app/api/webhooks/asaas/route.ts`: `await marcarCobrancaPaga(asaasId)` / `await marcarCobrancaAtrasada(asaasId)`.

- [ ] **Step 2: Atualizar as páginas (Server Components)**

Cada página que chama o store precisa `await`. As páginas já são (ou passam a ser) `async function`. Exemplos:

`src/app/(app)/matricula/page.tsx`:
```ts
export default async function MatriculaPage() {
  const [candidatos, alunos, cobrancas, planos, proximoCodigo] = await Promise.all([
    candidatosMatricula(), listarAlunos(), listarCobrancas(),
    listarPlanos(), proximoCodigoCadastro(),
  ]);
  const planosAtivos = planos.filter((p) => p.ativo !== false);
  // usa planoPorId? troque por lookup no array `planos` já carregado.
  // ... resto igual, mas usando as variáveis já resolvidas.
}
```
> Onde o código chamava `planoPorId(x)` dentro de `.map`, troque por um `Map` criado a partir de `planos` já carregado (evita N awaits). Ex.: `const planoById = new Map(planos.map((p) => [p.id, p]));`

`src/app/(app)/cobranca/page.tsx`, `retencao/page.tsx`, `relatorios/page.tsx`, `clientes/page.tsx`, `clientes/[id]/page.tsx`, `custos/page.tsx`, `captacao/page.tsx`: mesma transformação — tornar a função `async`, `await` nas chamadas, e substituir `planoPorId(...)` dentro de loops por lookup em `Map` pré-carregado.

`src/app/(app)/clientes/[id]/page.tsx` (já async):
```ts
  const pessoa = await obterPessoa(id);
  if (!pessoa) notFound();
  const plano = pessoa.planoId ? await planoPorId(pessoa.planoId) : undefined;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros). Resolva qualquer chamada restante sem `await` que o compilador apontar (tipo `Promise<X>` onde espera `X`).

- [ ] **Step 4: Verificar no navegador**

Run: `docker compose up -d db` (garante o Postgres) e `npm run dev`. Abra `/matricula`, `/cobranca`, `/clientes`, `/relatorios`, `/custos`, `/captacao`, `/retencao`.
Expected: todas renderizam HTTP 200 com os dados seedados; sem erro no console.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)" src/app/api
git commit -m "refactor: consumidores usam a fachada assíncrona (await) — telas preservadas"
```

---

## Task 12: Autenticação — senha, sessão, login

**Files:**
- Create: `src/lib/auth/password.ts`, `src/lib/auth/session.ts`
- Create: `src/app/api/auth/login/route.ts`, `src/app/api/auth/logout/route.ts`, `src/app/login/page.tsx`
- Test: `src/lib/auth/password.test.ts`

- [ ] **Step 1: Teste do hash de senha**

`src/lib/auth/password.test.ts`:
```ts
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

test("hash e verify batem", async () => {
  const h = await hashPassword("segredo123");
  expect(await verifyPassword(h, "segredo123")).toBe(true);
  expect(await verifyPassword(h, "errado")).toBe(false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/auth/password.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `password.ts`**

```ts
import { hash, verify } from "@node-rs/argon2";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/auth/password.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar `session.ts`** (cookie httpOnly + registro em `Session`)

```ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

const COOKIE = "coliseu_session";
const DIAS = 7;

export async function criarSessao(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + DIAS * 86_400_000);
  const s = await prisma.session.create({ data: { userId, expiresAt } });
  (await cookies()).set(COOKIE, s.id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
}

export async function usuarioAtual() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const s = await prisma.session.findUnique({ where: { id }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

export async function destruirSessao(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await prisma.session.delete({ where: { id } }).catch(() => {});
  jar.delete(COOKIE);
}
```

- [ ] **Step 6: Rota de login**

`src/app/api/auth/login/route.ts`:
```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { criarSessao } from "@/lib/auth/session";

export async function POST(req: Request) {
  const { email, senha } = (await req.json()) as { email?: string; senha?: string };
  if (!email || !senha) {
    return NextResponse.json({ erro: "Informe e-mail e senha" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(user.passwordHash, senha))) {
    return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
  }
  await criarSessao(user.id);
  return NextResponse.json({ ok: true, role: user.role });
}
```

`src/app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { destruirSessao } from "@/lib/auth/session";

export async function POST() {
  await destruirSessao();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Página de login** (identidade visual atual)

`src/app/login/page.tsx` — usar os primitivos existentes (`Card`) e as classes já usadas (`inputCls`, cores `red`/`ink`/`surface`). Formulário client que faz `POST /api/auth/login` e redireciona para `/painel`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar() {
    setErro(""); setEnviando(true);
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(d?.erro ?? "Falha no login"); setEnviando(false); return;
    }
    router.push("/painel"); router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]">
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Coliseu CRM
        </h1>
        <p className="mt-1 text-sm text-muted">Acesso restrito</p>
        <div className="mt-5 flex flex-col gap-3">
          <input className={inputCls} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Senha" value={senha}
            onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} />
        </div>
        {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}
        <button onClick={entrar} disabled={enviando}
          className="mt-5 w-full rounded-lg bg-red px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright disabled:opacity-60">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Testar login via curl**

Run:
```bash
curl -s -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@coliseu.local","senha":"coliseu123"}' | grep -iE "HTTP|set-cookie|ok"
```
Expected: `HTTP/1.1 200`, um `Set-Cookie: coliseu_session=...`, e `{"ok":true,...}`. Credencial errada → 401.

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth "src/app/api/auth" src/app/login
git commit -m "feat(auth): senha (argon2), sessão por cookie e login/logout"
```

---

## Task 13: RBAC + proteção de rotas (middleware)

**Files:**
- Create: `src/lib/auth/rbac.ts`
- Create: `src/middleware.ts`
- Test: `src/lib/auth/rbac.test.ts`

- [ ] **Step 1: Teste da checagem de papel (pura)**

`src/lib/auth/rbac.test.ts`:
```ts
import { expect, test } from "vitest";
import { podePapel } from "@/lib/auth/rbac";

test("ADMIN pode tudo; RECEPCAO não é TECNICO", () => {
  expect(podePapel("ADMIN", ["ADMIN"])).toBe(true);
  expect(podePapel("ADMIN", ["TECNICO"])).toBe(true); // ADMIN é superset
  expect(podePapel("RECEPCAO", ["TECNICO"])).toBe(false);
  expect(podePapel("RECEPCAO", ["RECEPCAO", "ADMIN"])).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/auth/rbac.test.ts`
Expected: FALHA.

- [ ] **Step 3: Implementar `rbac.ts`**

```ts
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/session";

export type Papel = "ADMIN" | "RECEPCAO" | "TECNICO";

/** ADMIN é superset de qualquer exigência; senão precisa estar na lista. */
export function podePapel(papel: Papel, exigidos: Papel[]): boolean {
  if (papel === "ADMIN") return true;
  return exigidos.includes(papel);
}

export async function requireUser() {
  const user = await usuarioAtual();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(exigidos: Papel[]) {
  const user = await requireUser();
  if (!podePapel(user.role as Papel, exigidos)) redirect("/painel");
  return user;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/auth/rbac.test.ts`
Expected: PASS.

- [ ] **Step 5: Middleware de proteção**

`src/middleware.ts` — protege o grupo `(app)` e as rotas `/api/*` (exceto `/api/auth/*` e `/api/webhooks/*`), checando só a **presença** do cookie (a validação forte fica nas server functions; o middleware roda em edge e não acessa o Prisma):

```ts
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/webhooks"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const temSessao = Boolean(req.cookies.get("coliseu_session")?.value);
  if (!temSessao) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // tudo, menos assets estáticos e o próprio _next
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)",
  ],
};
```

- [ ] **Step 6: Reforço no layout do grupo `(app)`**

Em `src/app/(app)/layout.tsx`, chame `requireUser()` no topo (validação forte com Prisma, além do middleware):
```ts
import { requireUser } from "@/lib/auth/rbac";
// dentro do componente async do layout, antes do return:
  await requireUser();
```
Se o layout não for async, torne-o `async`.

- [ ] **Step 7: Verificar proteção**

Run (dev server no ar, sem cookie):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/pessoas         # espera 401
curl -s -o /dev/null -w "%{http_code}\n" -L http://localhost:3000/painel            # redireciona p/ /login (200 no login)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/webhooks/asaas -H "Content-Type: application/json" -d '{"event":"X"}' # 200 (webhook público)
```
Expected: `/api/pessoas` → 401; `/painel` sem cookie → cai no login; webhook segue público.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/rbac.ts src/lib/auth/rbac.test.ts src/middleware.ts "src/app/(app)/layout.tsx"
git commit -m "feat(auth): RBAC + middleware protegendo app e /api (webhook e auth públicos)"
```

---

## Task 14: `/painel` lê dados reais (sai do mock)

**Files:**
- Modify: `src/app/(app)/painel/page.tsx`

- [ ] **Step 1: Reescrever o painel para usar o store/repositórios**

Substitua os imports de `mock-data` (arrays) por chamadas ao store, tornando a página `async`. Cabeçalho e JSX permanecem iguais (identidade visual preservada); só a origem dos números muda:

```tsx
import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";
import { Badge, Card, Stat } from "@/components/ui/primitives";
import { formatBRL, diasSemPresenca, faixaAusencia } from "@/lib/mock-data";
import { listarAlunos, listarLeads, listarCobrancas } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const [alunos, leads, cobrancas] = await Promise.all([
    listarAlunos(), listarLeads(), listarCobrancas(),
  ]);

  const leadsAtivos = leads.filter((l) => l.estagio !== "perdido" && l.estagio !== "convertido").length;
  const convertidos = alunos.length; // alunos = leads convertidos, na Fase 1
  const taxaConversao = Math.round((convertidos / (convertidos + leadsAtivos || 1)) * 100);

  const ativos = alunos.filter((a) => a.status === "ativo").length;
  const inadimplentes = alunos.filter((a) => a.status === "inadimplente");
  const valorEmAberto = cobrancas.filter((c) => c.status !== "pago").reduce((s, c) => s + c.valor, 0);
  const ausentes = alunos.filter((a) => faixaAusencia(diasSemPresenca(a)));
  const pendentes = alunos.filter((a) => a.status === "pendente").length;

  const stages = [
    { step: 1, title: "Captação", href: "/captacao", metric: `${leadsAtivos} leads no funil`, desc: "WhatsApp, redes, balcão e indicação entram no CRM e são qualificados." },
    { step: 2, title: "Matrícula", href: "/matricula", metric: `${pendentes} aguardando pagamento`, desc: "Plano → cadastro → Asaas → link via WhatsApp → webhook confirma." },
    { step: 3, title: "Cobrança", href: "/cobranca", metric: `${inadimplentes.length} inadimplentes`, desc: "Avisos de vencimento, inadimplência e renovação de plano." },
    { step: 4, title: "Retenção", href: "/retencao", metric: `${ausentes.length} em risco de evasão`, desc: "Monitora presença e dispara campanhas em 7, 14 e 21 dias." },
  ];

  return (
    // ... COLE AQUI o mesmo JSX do painel atual (header + grid de Stat + pipeline + inadimplentes),
    // usando as variáveis acima. Nenhuma classe/estrutura muda.
    <></>
  );
}
```
> Ao aplicar, copie o bloco JSX existente do `painel/page.tsx` (linhas do `return`) e apenas garanta que ele referencia `alunos/leads/cobrancas` já resolvidos e `ausentes/inadimplentes/valorEmAberto/taxaConversao/pendentes`. `diasSemPresenca`/`faixaAusencia` continuam vindo de `mock-data` (funções puras).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verificar no navegador**

Run: `npm run dev`, faça login, abra `/painel`.
Expected: métricas refletem o **banco** (8 alunos, inadimplência real, etc.), não mais o mock estático. Números batem com `/clientes` e `/cobranca`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/painel/page.tsx"
git commit -m "fix(painel): lê dados reais do store (fim da divergência com o mock)"
```

---

## Task 15: Verificação final da Fase 1

- [ ] **Step 1: Suite de testes**

Run: `npm test`
Expected: todos os testes passam (db, mappers, planos, pessoas, financeiro, password, rbac).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros de tipo; build conclui; rotas `/login`, `/api/auth/*` aparecem.

- [ ] **Step 3: Smoke manual do ciclo**

1. `docker compose up -d db`, `npm run db:reset && npm run db:seed`, `npm run dev`.
2. `/painel` sem login → redireciona para `/login`.
3. Login com `admin@coliseu.local` / `coliseu123` → entra no painel com dados reais.
4. Criar um plano em `/cobranca` (aba Planos) → aparece em `/matricula`.
5. Matricular um lead → cobrança criada; `/painel` reflete +1 aguardando pagamento.
6. Reiniciar o servidor (`npm run dev` de novo) → **os dados persistem** (Postgres).

- [ ] **Step 4: Confirmar persistência (critério de sucesso central)**

Run: após reiniciar o processo, `curl` autenticado (ou navegador) em `/api/planos` mostra o plano criado no passo anterior.
Expected: dado persiste entre reinícios — objetivo #1 da Fase 1 cumprido.

---

## Cobertura do spec (self-review) — Fase 1

| Requisito do spec (Fase 1) | Task |
|---|---|
| PostgreSQL + Prisma | 1, 2, 3, 4 |
| Migração gradual store→repositório (fachada) | 6–11 |
| `mock-data` → `prisma/seed.ts` | 5 |
| Autenticação por sessão | 12 |
| RBAC (ADMIN/RECEPCAO/TECNICO) | 13 |
| `/painel` sem mock | 14 |
| Telas preservadas / identidade visual | 11, 14 (JSX inalterado) |
| Testes (harness + unit/integração) | 2 e testes em cada task |
| Sem entrar no domínio de acesso/catraca | escopo respeitado (fases 2+) |
| Persistência sobrevive a restart (critério de sucesso) | 15 |

**Fora de escopo (fases posteriores):** entidades de acesso (AccessDevice, AccessEvent, etc.),
webhook idempotente com `WebhookEvent` (Fase 2), `externalReference` no Asaas (Fase 2),
separação total de status Membership/Billing/Access (Fase 3), agente e adapter (Fase 4–5).

**Nota de risco:** a conversão sync→async toca muitos arquivos (Task 11); rode o typecheck
após cada arquivo para não acumular erros. O `membershipToStatus` (Task 6) é uma ponte
temporária para não quebrar as telas — a separação real de status é da Fase 3.
