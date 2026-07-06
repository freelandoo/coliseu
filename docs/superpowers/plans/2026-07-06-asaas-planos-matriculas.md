# Integração Asaas (matrículas, links, gestão de planos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar o Coliseu CRM à API sandbox do Asaas (assinatura recorrente na matrícula, link de pagamento no WhatsApp, confirmação por webhook) e adicionar uma aba de gestão de planos (criar / listar / editar valor) dentro de `/cobranca`.

**Architecture:** Planos migram de um `const` estático em `mock-data.ts` para estado mutável no `store` em memória (mesmo padrão de `cobrancas`/`despesas`, persistido em `globalThis`). Server Components leem do store e passam dados para Client Components via props; mutações via rotas `/api/*` + `router.refresh()`. A integração Asaas vive em `lib/asaas.ts` (com fallback mockado quando não há `ASAAS_API_KEY`) e é orquestrada no fluxo de matrícula já existente (`PATCH /api/pessoas/[id]` com `acao: "matricular"`).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, Asaas REST v3.

**Contexto do repositório (importante):**
- Não há framework de teste instalado. A verificação de cada task usa **typecheck** (`npx tsc --noEmit`) e checagem manual via `curl`/navegador com o dev server (`npm run dev`, porta 3000).
- O store zera em restart do processo (in-memory). Isso é esperado.
- Sem `ASAAS_API_KEY` no ambiente, todo o fluxo Asaas roda **mockado** — os testes manuais abaixo assumem modo mock, salvo indicação de sandbox real.
- `store.ts` é **server-only** (mantém o DB em memória). Client Components (`"use client"`) **não podem** importar dele — recebem dados via props.

---

## Blast radius: planos deixam de ser estáticos

Hoje `planos` (const) e `planoPorId` vivem em `src/lib/mock-data.ts` e são importados por:
- **Server:** `cobranca/page.tsx`, `matricula/page.tsx`, `retencao/page.tsx`, `relatorios/page.tsx`, `store.ts`.
- **Client:** `FichaCliente.tsx` (importa `planoPorId`), `MatriculaFlow.tsx` (recebe `planos` via prop; importa só `formatBRL`).

Regra nova: **todo read server-side de planos vem do `store`; nenhum Client Component importa `planoPorId`.** `MatriculaFlow` continua recebendo `planos` por prop. `FichaCliente` passa a receber o `plano` resolvido por prop.

---

## Task 1: Ambiente — .gitignore + .env.example

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Abrir exceção para o `.env.example` no `.gitignore`**

O `.gitignore` tem `.env*` (linha ~34), que ignora até o exemplo. Localize:

```
# env files (can opt-in for committing if needed)
.env*
```

e troque por:

```
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

- [ ] **Step 2: Criar `.env.example`** (sem segredos)

```bash
# Asaas — deixe ASAAS_API_KEY vazio para rodar em modo mock.
# Sandbox: gere a chave em https://sandbox.asaas.com (Configurações da Conta > Integrações > API).
ASAAS_API_KEY=
# "sandbox" (padrão) ou "production"
ASAAS_ENV=sandbox
# Token secreto configurado no webhook do Asaas (header asaas-access-token).
ASAAS_WEBHOOK_TOKEN=
```

- [ ] **Step 3: Verificar que o exemplo entra no git e o `.env.local` não**

Run:
```bash
git check-ignore .env.example; echo "example rc=$?"
git check-ignore .env.local;   echo "local rc=$?"
```
Expected: `.env.example` → nada impresso, `example rc=1` (NÃO ignorado). `.env.local` → impresso `.env.local`, `local rc=0` (ignorado).

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: env do Asaas (.env.example) e exceção no .gitignore"
```

---

## Task 2: Tipos do domínio (planos, assinatura, matrícula Asaas)

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Adicionar `ativo`/`descricao` ao `Plano` e o tipo `NovoPlano`**

Localize a interface `Plano` (bloco "Plano (Estágio 2)") e substitua-a por:

```ts
// Plano (Estágio 2)
export interface Plano {
  id: string;
  nome: string;
  valorMensal: number;
  duracaoMeses: number;
  ativo?: boolean; // false = arquivado (não oferecido em novas matrículas). undefined = ativo.
  descricao?: string;
}

/** Dados para criar um plano novo pela gestão de planos. */
export interface NovoPlano {
  nome: string;
  valorMensal: number;
  duracaoMeses: number;
  descricao?: string;
}
```

- [ ] **Step 2: Adicionar `assinaturaId` à `Cobranca`**

Localize a interface `Cobranca` (fim do arquivo) e adicione o campo `assinaturaId`:

```ts
export interface Cobranca {
  id: string;
  alunoId: string;
  tipo: CobrancaTipo;
  valor: number;
  vencimento: string; // ISO
  status: CobrancaStatus;
  asaasId: string | null; // null = ainda não sincronizado com Asaas
  assinaturaId?: string; // id da assinatura Asaas (subscription), quando recorrente
  linkPagamento?: string;
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros — nenhum consumidor quebrou; campos são opcionais).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "types: Plano.ativo/descricao, NovoPlano e Cobranca.assinaturaId"
```

---

## Task 3: Planos viram estado mutável no store

Esta é a task central. Ela move `planos`/`planoPorId` de `mock-data.ts` para o `store` e conserta **todos** os consumidores na mesma leva, para o typecheck fechar.

**Files:**
- Modify: `src/lib/mock-data.ts` (renomeia `planos` → `planosSeed`; remove `planoPorId`)
- Modify: `src/lib/store.ts` (passa a ser dono de `planos` + CRUD)
- Modify: `src/app/(app)/cobranca/page.tsx` (import do store)
- Modify: `src/app/(app)/matricula/page.tsx` (import do store)
- Modify: `src/app/(app)/retencao/page.tsx` (import do store)
- Modify: `src/app/(app)/relatorios/page.tsx` (import do store)
- Modify: `src/app/(app)/clientes/[id]/page.tsx` (resolve plano e passa via prop)
- Modify: `src/components/clientes/FichaCliente.tsx` (recebe `plano` via prop)

- [ ] **Step 1: `mock-data.ts` — renomear `planos` para `planosSeed` e remover `planoPorId`**

Localize (linhas ~20-25):

```ts
export const planos: Plano[] = [
  { id: "p-mensal", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1 },
  { id: "p-tri", nome: "Trimestral", valorMensal: 109.9, duracaoMeses: 3 },
  { id: "p-semestral", nome: "Semestral", valorMensal: 94.9, duracaoMeses: 6 },
  { id: "p-anual", nome: "Anual", valorMensal: 79.9, duracaoMeses: 12 },
];
```

Renomeie a const para `planosSeed`:

```ts
export const planosSeed: Plano[] = [
  { id: "p-mensal", nome: "Mensal", valorMensal: 129.9, duracaoMeses: 1 },
  { id: "p-tri", nome: "Trimestral", valorMensal: 109.9, duracaoMeses: 3 },
  { id: "p-semestral", nome: "Semestral", valorMensal: 94.9, duracaoMeses: 6 },
  { id: "p-anual", nome: "Anual", valorMensal: 79.9, duracaoMeses: 12 },
];
```

E **remova** a função `planoPorId` deste arquivo (linhas ~62-64):

```ts
export function planoPorId(id: string): Plano | undefined {
  return planos.find((p) => p.id === id);
}
```

- [ ] **Step 2: `store.ts` — importar `planosSeed`, adicionar `planos` ao DB e usar `planoPorId` local**

No topo, ajuste o import de `./mock-data` para trazer `planosSeed` em vez de `planoPorId`:

```ts
import {
  alunos as seedAlunos,
  cobrancas as seedCobrancas,
  diasEntre,
  leads as seedLeads,
  planosSeed,
} from "./mock-data";
```

Adicione `Plano` e `NovoPlano` ao import de `./types` (junte aos tipos já importados):

```ts
  type NovaPessoa,
  type NovoPlano,
  type Pessoa,
  type Plano,
```

Atualize o tipo `StoreDB` e o seed do `globalThis` para incluir `planos`:

```ts
type StoreDB = {
  pessoas: Pessoa[];
  cobrancas: Cobranca[];
  despesas: Despesa[];
  planos: Plano[];
};
const g = globalThis as unknown as { __coliseuDB?: StoreDB };
g.__coliseuDB ??= {
  pessoas: seed(),
  cobrancas: [...seedCobrancas],
  planos: planosSeed.map((p) => ({ ...p })),
  despesas: [
    { id: "d-01", categoria: "Luz", valor: 320, data: "2026-07-05" },
    { id: "d-02", categoria: "Água", valor: 140, data: "2026-07-05" },
    { id: "d-03", categoria: "Internet", valor: 150, data: "2026-07-03", recorrente: true },
  ],
};
```

Atualize a linha de desestruturação para incluir `planos`:

```ts
const { pessoas, cobrancas, despesas, planos } = g.__coliseuDB;
```

- [ ] **Step 3: `store.ts` — adicionar as funções de planos**

Logo após o bloco `/* ---------- leitura ---------- */` (perto de `listarPessoas`), adicione uma seção de planos:

```ts
/* ---------- planos ---------- */
export function listarPlanos(): Plano[] {
  return planos;
}

export function planoPorId(id: string): Plano | undefined {
  return planos.find((p) => p.id === id);
}

export function criarPlano(input: NovoPlano): Plano {
  const novo: Plano = {
    id: `p-${Date.now().toString(36)}`,
    nome: input.nome.trim(),
    valorMensal: input.valorMensal,
    duracaoMeses: input.duracaoMeses,
    descricao: input.descricao?.trim() || undefined,
    ativo: true,
  };
  planos.push(novo);
  return novo;
}

export function atualizarPlano(
  id: string,
  patch: Partial<Plano>,
): Plano | undefined {
  const i = planos.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  planos[i] = { ...planos[i], ...patch, id: planos[i].id };
  return planos[i];
}
```

Observação: `store.ts` já usa `planoPorId(...)` internamente em `matricularPessoa` e `receitaRecorrente` — como agora existe a versão local, esses usos passam a resolver da função local automaticamente (não mexa neles nesta task).

- [ ] **Step 4: Trocar imports nos Server Components**

Em `src/app/(app)/cobranca/page.tsx` — remova `planoPorId` do import de `mock-data` e importe do store. A linha 7 hoje é:

```ts
import { diasEntre, formatBRL, formatData, planoPorId } from "@/lib/mock-data";
import { alunoPorId, listarAlunos, listarCobrancas } from "@/lib/store";
```

Troque por:

```ts
import { diasEntre, formatBRL, formatData } from "@/lib/mock-data";
import { alunoPorId, listarAlunos, listarCobrancas, planoPorId } from "@/lib/store";
```

Em `src/app/(app)/matricula/page.tsx` — a linha 5 hoje é:

```ts
import { planoPorId, planos } from "@/lib/mock-data";
```

Remova-a. No import do store (linhas 6-11), adicione `listarPlanos` e `planoPorId`:

```ts
import {
  candidatosMatricula,
  listarAlunos,
  listarCobrancas,
  listarPlanos,
  planoPorId,
  proximoCodigoCadastro,
} from "@/lib/store";
```

Ainda em `matricula/page.tsx`, a chamada ao componente usa `planos={planos}` (linha ~54). Troque para oferecer só planos ativos:

```tsx
        <MatriculaFlow
          planos={listarPlanos().filter((p) => p.ativo !== false)}
          candidatosIniciais={candidatos}
          matriculadosIniciais={matriculadosIniciais}
          proximoCodigoInicial={proximoCodigoInicial}
        />
```

(Se `proximoCodigoInicial` não existir como variável, mantenha o valor já usado: `proximoCodigoInicial={proximoCodigoCadastro()}`.)

Em `src/app/(app)/retencao/page.tsx` — remova `planoPorId` do import de `mock-data` e importe do store. Hoje (linhas ~9-12) é algo como:

```ts
import {
  ...,
  planoPorId,
} from "@/lib/mock-data";
```

Deixe os demais helpers (`formatData`, `diasEntre`, etc.) vindo de `mock-data` e adicione `planoPorId` ao import existente de `@/lib/store` (a página já importa do store). Se ainda não houver import do store, adicione:

```ts
import { planoPorId } from "@/lib/store";
```

Em `src/app/(app)/relatorios/page.tsx` — mesma ideia: remova `planoPorId` e `planos` do import de `mock-data` e traga do store:

```ts
import { listarPlanos, planoPorId } from "@/lib/store";
```

e onde o arquivo usa `planos` (linha ~88, `const planosData = planos.map(...)`), troque `planos` por `listarPlanos()`:

```ts
  const planosData = listarPlanos().map((p) => ({
```

- [ ] **Step 5: `FichaCliente.tsx` — receber `plano` via prop (Client Component)**

Na linha 9, remova `planoPorId` do import de `mock-data`:

```ts
import { formatBRL, formatData } from "@/lib/mock-data";
```

Adicione `Plano` ao import de tipos (linhas 10-15):

```ts
import {
  LEAD_ESTAGIO_LABEL,
  ORIGEM_LABEL,
  type LeadEstagio,
  type Pessoa,
  type Plano,
} from "@/lib/types";
```

Ajuste a assinatura do componente (linha ~23) para receber `plano`:

```ts
export function FichaCliente({
  pessoa,
  plano,
}: {
  pessoa: Pessoa;
  plano?: Plano;
}) {
```

E remova a resolução local (linha ~42):

```ts
  const plano = pessoa.planoId ? planoPorId(pessoa.planoId) : undefined;
```

(As linhas 195-196 que usam `plano?.nome` / `plano.valorMensal` continuam iguais — agora leem a prop.)

- [ ] **Step 6: `clientes/[id]/page.tsx` — resolver o plano no server e passar via prop**

Substitua o arquivo inteiro por:

```tsx
import { notFound } from "next/navigation";
import { Reveal } from "@/components/ui/Reveal";
import { FichaCliente } from "@/components/clientes/FichaCliente";
import { obterPessoa, planoPorId } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pessoa = obterPessoa(id);
  if (!pessoa) notFound();

  const plano = pessoa.planoId ? planoPorId(pessoa.planoId) : undefined;

  return (
    <Reveal>
      <FichaCliente pessoa={pessoa} plano={plano} />
    </Reveal>
  );
}
```

- [ ] **Step 7: Verificar typecheck (todos os consumidores)**

Run: `npx tsc --noEmit`
Expected: PASS (0 erros). Se aparecer "Cannot find name 'planos'" ou "'planoPorId' is not exported by mock-data", revisite os Steps 4-6 no arquivo apontado.

- [ ] **Step 8: Verificar no navegador que nada regrediu**

Run: `npm run dev` (se não estiver rodando) e abra:
- `http://localhost:3000/matricula` → a lista de planos aparece (Mensal/Trimestral/Semestral/Anual).
- `http://localhost:3000/clientes` → abrir um aluno mostra Plano e Valor na ficha.
- `http://localhost:3000/relatorios` → o gráfico de planos carrega sem erro.

Expected: as três telas renderizam sem erro no console.

- [ ] **Step 9: Commit**

```bash
git add src/lib/mock-data.ts src/lib/store.ts \
  "src/app/(app)/cobranca/page.tsx" "src/app/(app)/matricula/page.tsx" \
  "src/app/(app)/retencao/page.tsx" "src/app/(app)/relatorios/page.tsx" \
  "src/app/(app)/clientes/[id]/page.tsx" src/components/clientes/FichaCliente.tsx
git commit -m "refactor: planos como estado mutável no store (base para edição de valor)"
```

---

## Task 4: Store — funções de baixa/atraso de cobrança (para o webhook)

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: Adicionar `marcarCobrancaPaga` e `marcarCobrancaAtrasada`**

Após a função `listarCobrancas` (bloco de cobranças/adaptadores), adicione:

```ts
/** Webhook Asaas: pagamento confirmado → cobrança paga + aluno ativo. */
export function marcarCobrancaPaga(asaasId: string): boolean {
  const c = cobrancas.find((c) => c.asaasId === asaasId);
  if (!c) return false;
  c.status = "pago";
  const p = pessoas.find((p) => p.id === c.alunoId);
  if (p) p.status = "ativo";
  return true;
}

/** Webhook Asaas: pagamento vencido → cobrança atrasada + aluno inadimplente. */
export function marcarCobrancaAtrasada(asaasId: string): boolean {
  const c = cobrancas.find((c) => c.asaasId === asaasId);
  if (!c) return false;
  c.status = "atrasado";
  const p = pessoas.find((p) => p.id === c.alunoId);
  if (p) p.status = "inadimplente";
  return true;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (`CobrancaStatus` inclui `"pago"` e `"atrasado"`; `AlunoStatus` inclui `"ativo"` e `"inadimplente"` — compatível.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat(store): baixa e atraso de cobrança por asaasId (webhook)"
```

---

## Task 5: Cliente Asaas — assinaturas recorrentes

**Files:**
- Modify: `src/lib/asaas.ts`

- [ ] **Step 1: Adicionar os tipos de assinatura e do resultado de matrícula**

Após a interface `AsaasCharge` (linha ~25), adicione:

```ts
export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  cycle: "MONTHLY";
  nextDueDate: string; // YYYY-MM-DD
  status: string;
}

/** Resultado consolidado de uma matrícula no Asaas (mock ou real). */
export interface AsaasMatricula {
  customerId: string;
  assinaturaId: string;
  cobrancaId: string; // id da 1ª cobrança da assinatura (vira Cobranca.asaasId)
  linkPagamento: string; // invoiceUrl da 1ª cobrança
}
```

- [ ] **Step 2: Adicionar `criarAssinatura`**

Após `gerarCobranca` (antes de `linkPagamentoWhatsApp`), adicione:

```ts
/** Cria a assinatura mensal recorrente (POST /subscriptions). */
export async function criarAssinatura(input: {
  customer: string;
  value: number;
  description?: string;
}): Promise<AsaasSubscription> {
  // 1ª cobrança vence amanhã (dá tempo de o aluno pagar o PIX de matrícula).
  const nextDueDate = new Date(Date.now() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  if (!temCredenciais()) {
    return {
      id: `sub_mock_${Date.now()}`,
      customer: input.customer,
      value: input.value,
      cycle: "MONTHLY",
      nextDueDate,
      status: "ACTIVE",
    };
  }

  const res = await fetch(`${ASAAS_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY!,
    },
    body: JSON.stringify({
      customer: input.customer,
      billingType: "PIX",
      cycle: "MONTHLY",
      value: input.value,
      nextDueDate,
      description: input.description,
    }),
  });
  if (!res.ok) throw new Error(`Asaas subscriptions: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Adicionar `primeiraCobrancaAssinatura`**

Logo após `criarAssinatura`:

```ts
/** Busca a 1ª cobrança gerada pela assinatura (GET /subscriptions/{id}/payments). */
export async function primeiraCobrancaAssinatura(
  subscriptionId: string,
): Promise<AsaasCharge> {
  if (!temCredenciais()) {
    const id = `pay_mock_${Date.now()}`;
    return {
      id,
      customer: "",
      value: 0,
      dueDate: new Date().toISOString().slice(0, 10),
      billingType: "PIX",
      invoiceUrl: `https://asaas.com/c/${id}`,
      status: "PENDING",
    };
  }

  const res = await fetch(
    `${ASAAS_BASE}/subscriptions/${subscriptionId}/payments`,
    { headers: { access_token: process.env.ASAAS_API_KEY! } },
  );
  if (!res.ok) throw new Error(`Asaas subscription payments: ${res.status}`);
  const data = (await res.json()) as { data: AsaasCharge[] };
  return data.data[0];
}
```

- [ ] **Step 4: Adicionar o orquestrador `matricularNoAsaas`**

No fim do arquivo (depois de `linkPagamentoWhatsApp`):

```ts
/** Orquestra a matrícula no Asaas: cliente → assinatura → 1ª cobrança/link. */
export async function matricularNoAsaas(input: {
  id: string;
  codigo: string;
  nome: string;
  telefone?: string;
  email?: string;
  planoNome: string;
  valorMensal: number;
}): Promise<AsaasMatricula> {
  if (!temCredenciais()) {
    const cobrancaId = `pay_mock_${input.codigo.toLowerCase()}`;
    return {
      customerId: `cus_mock_${input.id}`,
      assinaturaId: `sub_mock_${input.id}`,
      cobrancaId,
      linkPagamento: `https://asaas.com/c/${cobrancaId}`,
    };
  }

  const cliente = await criarOuLocalizarCliente({
    name: input.nome,
    mobilePhone: (input.telefone ?? "").replace(/\D/g, ""),
    email: input.email,
  });
  const assinatura = await criarAssinatura({
    customer: cliente.id,
    value: input.valorMensal,
    description: `Plano ${input.planoNome} — Coliseu Team`,
  });
  const cobranca = await primeiraCobrancaAssinatura(assinatura.id);
  return {
    customerId: cliente.id,
    assinaturaId: assinatura.id,
    cobrancaId: cobranca.id,
    linkPagamento: cobranca.invoiceUrl,
  };
}
```

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/asaas.ts
git commit -m "feat(asaas): assinaturas recorrentes e orquestração de matrícula"
```

---

## Task 6: API de planos — listar e criar (`/api/planos`)

**Files:**
- Create: `src/app/api/planos/route.ts`

- [ ] **Step 1: Criar a rota GET/POST**

```ts
import { NextResponse } from "next/server";
import { criarPlano, listarPlanos } from "@/lib/store";
import type { NovoPlano } from "@/lib/types";

export async function GET() {
  return NextResponse.json(listarPlanos());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<NovoPlano>;

  if (!body?.nome?.trim()) {
    return NextResponse.json({ erro: "Nome é obrigatório" }, { status: 400 });
  }
  const valorMensal = Number(body.valorMensal);
  if (!Number.isFinite(valorMensal) || valorMensal <= 0) {
    return NextResponse.json({ erro: "Valor mensal inválido" }, { status: 400 });
  }
  const duracaoMeses = Number(body.duracaoMeses);
  if (!Number.isInteger(duracaoMeses) || duracaoMeses < 1) {
    return NextResponse.json({ erro: "Duração inválida" }, { status: 400 });
  }

  const plano = criarPlano({
    nome: body.nome,
    valorMensal,
    duracaoMeses,
    descricao: body.descricao,
  });
  return NextResponse.json(plano, { status: 201 });
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Testar via curl (dev server rodando)**

Run:
```bash
curl -s http://localhost:3000/api/planos | head -c 400; echo
curl -s -X POST http://localhost:3000/api/planos \
  -H "Content-Type: application/json" \
  -d '{"nome":"Semanal","valorMensal":49.9,"duracaoMeses":1}'; echo
curl -s -X POST http://localhost:3000/api/planos \
  -H "Content-Type: application/json" -d '{"nome":"","valorMensal":0}'; echo
```
Expected: 1ª lista os 4 planos (JSON array). 2ª retorna o plano criado com `id` e `"ativo":true`. 3ª retorna `{"erro":"Nome é obrigatório"}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/planos/route.ts
git commit -m "feat(api): GET/POST /api/planos (listar e criar plano)"
```

---

## Task 7: API de planos — editar/arquivar (`/api/planos/[id]`)

**Files:**
- Create: `src/app/api/planos/[id]/route.ts`

- [ ] **Step 1: Criar a rota PATCH**

```ts
import { NextResponse } from "next/server";
import { atualizarPlano } from "@/lib/store";
import type { Plano } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json()) as Partial<Plano>;

  const patch: Partial<Plano> = {};
  if (typeof body.nome === "string") {
    if (!body.nome.trim()) {
      return NextResponse.json({ erro: "Nome inválido" }, { status: 400 });
    }
    patch.nome = body.nome.trim();
  }
  if (body.valorMensal !== undefined) {
    const v = Number(body.valorMensal);
    if (!Number.isFinite(v) || v <= 0) {
      return NextResponse.json({ erro: "Valor mensal inválido" }, { status: 400 });
    }
    patch.valorMensal = v;
  }
  if (body.duracaoMeses !== undefined) {
    const d = Number(body.duracaoMeses);
    if (!Number.isInteger(d) || d < 1) {
      return NextResponse.json({ erro: "Duração inválida" }, { status: 400 });
    }
    patch.duracaoMeses = d;
  }
  if (typeof body.ativo === "boolean") patch.ativo = body.ativo;
  if (typeof body.descricao === "string") {
    patch.descricao = body.descricao.trim() || undefined;
  }

  const plano = atualizarPlano(id, patch);
  if (!plano) {
    return NextResponse.json({ erro: "Plano não encontrado" }, { status: 404 });
  }
  return NextResponse.json(plano);
}
```

Nota: editar `valorMensal` **não** propaga para assinaturas Asaas existentes (decisão "vale só para novos") — é só o valor de referência do plano.

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Testar via curl**

Run:
```bash
curl -s -X PATCH http://localhost:3000/api/planos/p-mensal \
  -H "Content-Type: application/json" -d '{"valorMensal":139.9}'; echo
curl -s -X PATCH http://localhost:3000/api/planos/p-mensal \
  -H "Content-Type: application/json" -d '{"ativo":false}'; echo
curl -s -X PATCH http://localhost:3000/api/planos/nao-existe \
  -H "Content-Type: application/json" -d '{"valorMensal":10}'; echo
```
Expected: 1ª retorna o plano `p-mensal` com `"valorMensal":139.9`. 2ª com `"ativo":false`. 3ª retorna `{"erro":"Plano não encontrado"}` (status 404).

- [ ] **Step 4: Reativar o plano de teste (higiene do estado dev)**

Run:
```bash
curl -s -X PATCH http://localhost:3000/api/planos/p-mensal \
  -H "Content-Type: application/json" -d '{"ativo":true,"valorMensal":129.9}'; echo
```
Expected: plano volta a `ativo:true`, `valorMensal:129.9`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/planos/[id]/route.ts"
git commit -m "feat(api): PATCH /api/planos/[id] (editar valor/nome/duração/arquivar)"
```

---

## Task 8: Integrar Asaas ao fluxo de matrícula

Liga a assinatura Asaas ao passo que já existe (`PATCH /api/pessoas/[id]` com `acao: "matricular"`), gravando `asaasId`/`assinaturaId`/`linkPagamento` reais e devolvendo o `waLink`.

**Files:**
- Modify: `src/lib/store.ts` (`matricularPessoa` aceita dados do Asaas)
- Modify: `src/app/api/pessoas/[id]/route.ts` (orquestra o Asaas)

- [ ] **Step 1: `store.ts` — `matricularPessoa` recebe dados opcionais do Asaas**

Adicione `AsaasMatricula` ao import de `./asaas` no topo do `store.ts` (crie o import se não houver — `store.ts` ainda não importa de `asaas`):

```ts
import type { AsaasMatricula } from "./asaas";
```

Substitua a função `matricularPessoa` atual por:

```ts
/** Transição lead → aluno: gera cobrança pendente e mantém o código da pessoa. */
export function matricularPessoa(
  id: string,
  planoId: string,
  asaas?: AsaasMatricula,
): Pessoa | undefined {
  const p = obterPessoa(id);
  if (!p) return undefined;

  const plano = planoPorId(planoId);
  const agora = new Date();
  const venc = new Date(agora);
  venc.setMonth(venc.getMonth() + (plano?.duracaoMeses ?? 1));

  const atualizado = atualizarPessoa(id, {
    fase: "aluno",
    status: "pendente",
    planoId,
    matriculadoEm: agora.toISOString(),
    vencimentoPlano: venc.toISOString(),
    ultimaPresenca: agora.toISOString(),
    estagio: undefined,
  });

  const asaasId = asaas?.cobrancaId ?? `pay_mock_${p.codigo.toLowerCase()}`;
  cobrancas.unshift({
    id: `c-${Date.now().toString(36)}`,
    alunoId: id,
    tipo: "matricula",
    valor: plano?.valorMensal ?? 0,
    vencimento: venc.toISOString(),
    status: "pendente",
    asaasId,
    assinaturaId: asaas?.assinaturaId,
    linkPagamento: asaas?.linkPagamento ?? `https://asaas.com/c/${asaasId}`,
  });

  return atualizado;
}
```

- [ ] **Step 2: `pessoas/[id]/route.ts` — chamar o Asaas na ação matricular**

Atualize os imports do topo:

```ts
import { NextResponse } from "next/server";
import {
  atualizarPessoa,
  matricularPessoa,
  obterPessoa,
  planoPorId,
  removerPessoa,
} from "@/lib/store";
import { linkPagamentoWhatsApp, matricularNoAsaas } from "@/lib/asaas";
import type { Pessoa } from "@/lib/types";
```

Substitua o bloco `if (body.acao === "matricular") { ... }` por (agora `async` já é o caso — a função `PATCH` já é async):

```ts
  // Ação especial: matricular (lead → aluno) + assinatura no Asaas
  if (body.acao === "matricular") {
    const { acao, planoId, ...campos } = body;
    void acao;
    if (!planoId) {
      return NextResponse.json({ erro: "planoId é obrigatório" }, { status: 400 });
    }
    // aplica campos de cadastro preenchidos no fluxo antes de matricular
    if (Object.keys(campos).length > 0) atualizarPessoa(id, campos);

    const pessoaAtual = obterPessoa(id);
    const plano = planoPorId(planoId);
    if (!pessoaAtual || !plano) {
      return NextResponse.json({ erro: "Pessoa ou plano não encontrado" }, { status: 404 });
    }

    let asaas;
    try {
      asaas = await matricularNoAsaas({
        id: pessoaAtual.id,
        codigo: pessoaAtual.codigo,
        nome: pessoaAtual.nome,
        telefone: pessoaAtual.telefone,
        email: pessoaAtual.email,
        planoNome: plano.nome,
        valorMensal: plano.valorMensal,
      });
    } catch (e) {
      console.error("[asaas] falha ao matricular:", e);
      return NextResponse.json(
        { erro: "Falha ao criar assinatura no Asaas" },
        { status: 502 },
      );
    }

    const pessoa = matricularPessoa(id, planoId, asaas);
    if (!pessoa) {
      return NextResponse.json({ erro: "Pessoa não encontrada" }, { status: 404 });
    }

    const waLink = pessoaAtual.telefone
      ? linkPagamentoWhatsApp(pessoaAtual.telefone, pessoaAtual.nome, asaas.linkPagamento)
      : undefined;

    return NextResponse.json({
      ...pessoa,
      linkPagamento: asaas.linkPagamento,
      waLink,
    });
  }
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Testar a matrícula ponta a ponta via curl (modo mock)**

Primeiro descubra o id de um lead em aberto:
```bash
curl -s http://localhost:3000/api/pessoas | head -c 1200; echo
```
Escolha um `id` cujo `"fase":"lead"` e rode (troque `<ID>`):
```bash
curl -s -X PATCH "http://localhost:3000/api/pessoas/<ID>" \
  -H "Content-Type: application/json" \
  -d '{"acao":"matricular","planoId":"p-mensal","cpf":"123.456.789-01"}'; echo
```
Expected: JSON da pessoa com `"fase":"aluno"`, `"status":"pendente"`, um `linkPagamento` (`https://asaas.com/c/pay_mock_...`) e `waLink` (`https://wa.me/55...`) quando havia telefone.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.ts "src/app/api/pessoas/[id]/route.ts"
git commit -m "feat: matrícula cria assinatura no Asaas e devolve link de pagamento"
```

---

## Task 9: MatriculaFlow usa o link real da resposta

Hoje `finalizar()` monta um `invoiceUrl` fake no cliente e ignora a resposta da API. Passa a usar `linkPagamento`/`waLink` retornados pelo servidor.

**Files:**
- Modify: `src/components/matricula/MatriculaFlow.tsx`

- [ ] **Step 1: Guardar o resultado da matrícula em estado e consumir na finalização**

No componente, o disparo da matrícula está em `finalizar()` (linha ~225), que faz `void fetch(...)` e monta o link localmente. Substitua o corpo de `finalizar()` para aguardar a resposta e usar o link real.

Localize o início de `finalizar` e o bloco do `fetch`:

```ts
  function finalizar() {
    if (!sel || !plano) return;

    // a pessoa já tem código desde o cadastro; usa o dela (fallback só por segurança)
    const codigo = sel.codigo ?? `CD${String(codigoSeq).padStart(5, "0")}`;
    setCodigoSeq((n) => n + 1);

    // persiste a transição lead → aluno no store (via API)
    void fetch(`/api/pessoas/${sel.refId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "matricular",
        planoId: plano.id,
        telefone: form.telefone,
        email: form.email,
        cpf: form.cpf,
        dataNascimento: form.dataNascimento || undefined,
        endereco: {
          cep: form.cep || undefined,
          estado: form.estado || undefined,
          cidade: form.cidade || undefined,
          rua: form.rua || undefined,
          numero: form.numero || undefined,
        },
      }),
    })
      .then(() => router.refresh())
      .catch(() => {});

    const invoiceUrl = `https://asaas.com/c/pay_mock_${codigo.toLowerCase()}`;
    const temCel = celValido(form.telefone);
    const temEmail = form.email.trim() !== "" && emailValido(form.email);

    const waLink = temCel
      ? linkPagamentoWhatsApp(form.telefone, form.nome, invoiceUrl)
      : undefined;
    const email = temEmail ? form.email.trim() : undefined;
```

Substitua tudo isso (da linha `function finalizar() {` até a linha `const email = temEmail ? form.email.trim() : undefined;`) por uma versão `async` que usa a resposta:

```ts
  async function finalizar() {
    if (!sel || !plano) return;

    // a pessoa já tem código desde o cadastro; usa o dela (fallback só por segurança)
    const codigo = sel.codigo ?? `CD${String(codigoSeq).padStart(5, "0")}`;
    setCodigoSeq((n) => n + 1);

    const temCel = celValido(form.telefone);
    const temEmail = form.email.trim() !== "" && emailValido(form.email);
    const email = temEmail ? form.email.trim() : undefined;

    // persiste a transição lead → aluno + cria assinatura no Asaas (via API)
    let waLink: string | undefined;
    try {
      const r = await fetch(`/api/pessoas/${sel.refId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "matricular",
          planoId: plano.id,
          telefone: form.telefone,
          email: form.email,
          cpf: form.cpf,
          dataNascimento: form.dataNascimento || undefined,
          endereco: {
            cep: form.cep || undefined,
            estado: form.estado || undefined,
            cidade: form.cidade || undefined,
            rua: form.rua || undefined,
            numero: form.numero || undefined,
          },
        }),
      });
      const data = (await r.json()) as { waLink?: string; linkPagamento?: string };
      waLink =
        data.waLink ??
        (temCel && data.linkPagamento
          ? linkPagamentoWhatsApp(form.telefone, form.nome, data.linkPagamento)
          : undefined);
      router.refresh();
    } catch {
      /* rede off: segue sem link real; a lista é atualizada no próximo refresh */
    }
```

O restante de `finalizar` (o cálculo de `enderecoCompleto`, `faltando`, a criação do objeto `novo: Matriculado`, `setMatriculados`, etc.) permanece **igual** — ele já usa as variáveis `waLink`, `email`, `codigo`, `temCel`, `temEmail`.

- [ ] **Step 2: Ajustar a chamada de `finalizar` (agora é async)**

`finalizar` é chamada no `onComplete` do timeline GSAP dentro de `matricular` (linha ~205: `gsap.timeline({ onComplete: finalizar })`). Como agora é `async`, envolva para não vazar a promise:

```ts
    const tl = gsap.timeline({ onComplete: () => void finalizar() });
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Testar no navegador**

Run: `npm run dev` e abra `http://localhost:3000/matricula`:
1. Busque uma pessoa (lead em aberto), preencha CPF + telefone, escolha um plano, clique **Matricular**.
2. Ao fim da animação, o modal "Matriculado com sucesso" abre com o botão **Enviar link de pagamento no WhatsApp**.
3. Passe o mouse no botão / inspecione o `href`: deve ser `https://wa.me/55...` contendo um link `asaas.com/c/pay_mock_...` (modo mock) codificado.

Expected: matrícula conclui, aluno aparece em "Aguardando pagamento", link do WhatsApp presente.

- [ ] **Step 5: Commit**

```bash
git add src/components/matricula/MatriculaFlow.tsx
git commit -m "feat(matricula): usar link de pagamento real retornado pela API"
```

---

## Task 10: Webhook Asaas funcional

**Files:**
- Modify: `src/app/api/webhooks/asaas/route.ts`

- [ ] **Step 1: Implementar as baixas no webhook**

Substitua o arquivo inteiro por:

```ts
import { NextResponse } from "next/server";
import { marcarCobrancaAtrasada, marcarCobrancaPaga } from "@/lib/store";

// ============================================================
// Webhook do Asaas (Estágio 2 — "Asaas confirma via webhook")
// Configurar em: Asaas → Integrações → Webhooks → URL /api/webhooks/asaas
// Eventos relevantes: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE
// ============================================================

interface AsaasWebhookBody {
  event: string;
  payment?: {
    id: string;
    customer: string;
    value: number;
    status: string;
  };
}

export async function POST(req: Request) {
  // Validação do segredo configurado no Asaas (header asaas-access-token).
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expected && req.headers.get("asaas-access-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as AsaasWebhookBody;
  const asaasId = body.payment?.id;

  switch (body.event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const ok = asaasId ? marcarCobrancaPaga(asaasId) : false;
      console.log("[asaas] pagamento confirmado:", asaasId, "→ baixa:", ok);
      break;
    }
    case "PAYMENT_OVERDUE": {
      const ok = asaasId ? marcarCobrancaAtrasada(asaasId) : false;
      console.log("[asaas] pagamento atrasado:", asaasId, "→ atraso:", ok);
      break;
    }
    default:
      console.log("[asaas] evento ignorado:", body.event);
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Testar o webhook via curl (modo mock)**

Use um `asaasId` de uma cobrança pendente existente. A cobrança semente `c-02` tem `asaasId: "pay_002"` (aluno `a-02` "Juliana"). Confirme o estado antes:
```bash
curl -s http://localhost:3000/api/pessoas | grep -o '"nome":"Juliana Castro"[^}]*' | head -c 200; echo
```
Dispare o webhook de pagamento confirmado:
```bash
curl -s -X POST http://localhost:3000/api/webhooks/asaas \
  -H "Content-Type: application/json" \
  -d '{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_002","customer":"c","value":129.9,"status":"RECEIVED"}}'; echo
```
Expected: resposta `{"received":true}` e, no log do dev server, `[asaas] pagamento confirmado: pay_002 → baixa: true`. A pessoa `a-02` fica `status: "ativo"`.

Teste o atraso com uma cobrança pendente (`c-03` → `asaasId: null` não serve; use `pay_006` de `c-05`, aluno `a-06`):
```bash
curl -s -X POST http://localhost:3000/api/webhooks/asaas \
  -H "Content-Type: application/json" \
  -d '{"event":"PAYMENT_OVERDUE","payment":{"id":"pay_006","customer":"c","value":129.9,"status":"OVERDUE"}}'; echo
```
Expected: `{"received":true}` e log `→ atraso: true`; pessoa `a-06` fica `inadimplente`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/asaas/route.ts
git commit -m "feat(webhook): baixa/atraso de cobrança e status do aluno via Asaas"
```

---

## Task 11: Componente de gestão de planos

**Files:**
- Create: `src/components/cobranca/GestaoPlanos.tsx`

- [ ] **Step 1: Criar o componente client `GestaoPlanos`**

Segue o padrão de modal do `CustosView`. Recebe planos já com a contagem de alunos.

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/mock-data";
import type { Plano } from "@/lib/types";

export interface PlanoComContagem extends Plano {
  alunos: number;
}

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-faint outline-none transition-colors focus:border-red/60";

export function GestaoPlanos({ planos }: { planos: PlanoComContagem[] }) {
  const router = useRouter();
  const [modalNovo, setModalNovo] = useState(false);
  const [editando, setEditando] = useState<Plano | null>(null);

  async function arquivar(p: Plano, ativo: boolean) {
    await fetch(`/api/planos/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-faint">
          Planos
        </h2>
        <button
          onClick={() => setModalNovo(true)}
          className="rounded-lg bg-red px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
        >
          + Novo plano
        </button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Plano</Th>
                <Th>Duração</Th>
                <Th>Alunos</Th>
                <Th className="text-right">Valor/mês</Th>
                <Th className="text-right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p) => {
                const inativo = p.ativo === false;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors hover:bg-surface-2",
                      inativo && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{p.nome}</span>
                      {inativo && (
                        <Badge tone="neutral" className="ml-2">
                          Arquivado
                        </Badge>
                      )}
                      {p.descricao && (
                        <p className="text-xs text-faint">{p.descricao}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {p.duracaoMeses} {p.duracaoMeses === 1 ? "mês" : "meses"}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.alunos}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {formatBRL(p.valorMensal)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setEditando(p)}
                          className="text-xs font-medium text-faint transition-colors hover:text-red-bright"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => arquivar(p, inativo)}
                          className="text-xs font-medium text-faint transition-colors hover:text-ink"
                        >
                          {inativo ? "Reativar" : "Arquivar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {modalNovo && (
        <ModalPlano
          onFechar={() => setModalNovo(false)}
          onSalvo={() => {
            setModalNovo(false);
            router.refresh();
          }}
        />
      )}
      {editando && (
        <ModalPlano
          plano={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ModalPlano({
  plano,
  onFechar,
  onSalvo,
}: {
  plano?: Plano;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const editando = Boolean(plano);
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [valor, setValor] = useState(
    plano ? String(plano.valorMensal).replace(".", ",") : "",
  );
  const [duracao, setDuracao] = useState(String(plano?.duracaoMeses ?? 1));
  const [descricao, setDescricao] = useState(plano?.descricao ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro("");
    const v = Number(valor.replace(",", "."));
    const d = Number(duracao);
    if (!nome.trim()) return setErro("Informe o nome do plano.");
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor válido.");
    if (!Number.isInteger(d) || d < 1) return setErro("Duração inválida.");

    setEnviando(true);
    const url = editando ? `/api/planos/${plano!.id}` : "/api/planos";
    const method = editando ? "PATCH" : "POST";
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          valorMensal: v,
          duracaoMeses: d,
          descricao,
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErro(data?.erro ?? "Não foi possível salvar.");
        setEnviando(false);
        return;
      }
      onSalvo();
    } catch {
      setErro("Falha de conexão.");
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-plate)]"
      >
        <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
          {editando ? "Editar plano" : "Novo plano"}
        </h3>

        <div className="mt-5 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nome</label>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Mensal, Trimestral…"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Valor mensal (R$)
            </label>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Duração (meses)
            </label>
            <input
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
              inputMode="numeric"
              placeholder="1"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Descrição (opcional)
            </label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {erro && <p className="mt-3 text-xs text-red-bright">{erro}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={enviar}
            disabled={enviando}
            className={cn(
              "flex-1 rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
              enviando
                ? "cursor-not-allowed bg-surface-2 text-faint"
                : "bg-red text-white hover:bg-red-bright",
            )}
          >
            {enviando ? "Salvando…" : editando ? "Salvar" : "Criar plano"}
          </button>
          <button
            onClick={onFechar}
            className="rounded-lg border border-border-strong px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-widest text-faint",
        className,
      )}
    >
      {children}
    </th>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (O componente ainda não é usado; a integração é na Task 12.)

- [ ] **Step 3: Commit**

```bash
git add src/components/cobranca/GestaoPlanos.tsx
git commit -m "feat(cobranca): componente de gestão de planos (criar/editar/arquivar)"
```

---

## Task 12: Aba "Planos" na página de Cobrança

Adiciona a alternância Cobranças / Planos. Como `cobranca/page.tsx` é Server Component, o toggle de aba fica num pequeno Client Component wrapper.

**Files:**
- Create: `src/components/cobranca/CobrancaTabs.tsx`
- Modify: `src/app/(app)/cobranca/page.tsx`

- [ ] **Step 1: Criar o wrapper de abas `CobrancaTabs`**

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  CobrancaFiltro,
  type LinhaCobranca,
} from "@/components/cobranca/CobrancaFiltro";
import {
  GestaoPlanos,
  type PlanoComContagem,
} from "@/components/cobranca/GestaoPlanos";

type Aba = "cobrancas" | "planos";

export function CobrancaTabs({
  linhas,
  planos,
}: {
  linhas: LinhaCobranca[];
  planos: PlanoComContagem[];
}) {
  const [aba, setAba] = useState<Aba>("cobrancas");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <TabBtn ativo={aba === "cobrancas"} onClick={() => setAba("cobrancas")}>
          Cobranças
        </TabBtn>
        <TabBtn ativo={aba === "planos"} onClick={() => setAba("planos")}>
          Planos
        </TabBtn>
      </div>

      {aba === "cobrancas" ? (
        <CobrancaFiltro linhas={linhas} />
      ) : (
        <GestaoPlanos planos={planos} />
      )}
    </div>
  );
}

function TabBtn({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-4 py-2 font-display text-sm font-semibold uppercase tracking-widest transition-colors",
        ativo
          ? "border-red/60 bg-red-ghost text-ink"
          : "border-border bg-surface text-muted hover:border-border-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: `cobranca/page.tsx` — calcular contagem por plano e usar `CobrancaTabs`**

No topo, ajuste os imports: troque a importação do `CobrancaFiltro` pela do `CobrancaTabs` e traga `listarPlanos` do store e o tipo `PlanoComContagem`.

O import atual (linhas ~4-8):

```ts
import {
  CobrancaFiltro,
  type LinhaCobranca,
} from "@/components/cobranca/CobrancaFiltro";
```

Troque por:

```ts
import { type LinhaCobranca } from "@/components/cobranca/CobrancaFiltro";
import { CobrancaTabs } from "@/components/cobranca/CobrancaTabs";
import { type PlanoComContagem } from "@/components/cobranca/GestaoPlanos";
```

E no import do store (linha ~8) adicione `listarPlanos`:

```ts
import {
  alunoPorId,
  listarAlunos,
  listarCobrancas,
  listarPlanos,
  planoPorId,
} from "@/lib/store";
```

Antes do `return`, após a linha `const linhas = [...atrasadas, ...aVencer, ...aRenovar];`, calcule a contagem de alunos por plano:

```ts
  // Planos com contagem de alunos ativos (para a aba "Planos")
  const contagemPorPlano = new Map<string, number>();
  for (const a of alunos) {
    if (a.status === "cancelado") continue;
    contagemPorPlano.set(a.planoId, (contagemPorPlano.get(a.planoId) ?? 0) + 1);
  }
  const planosComContagem: PlanoComContagem[] = listarPlanos().map((p) => ({
    ...p,
    alunos: contagemPorPlano.get(p.id) ?? 0,
  }));
```

Por fim, no JSX, troque o bloco que renderiza `<CobrancaFiltro linhas={linhas} />` (dentro do último `<Reveal delay={0.1}>`) por:

```tsx
      <Reveal delay={0.1}>
        <div className="mt-10">
          <CobrancaTabs linhas={linhas} planos={planosComContagem} />
        </div>
      </Reveal>
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Testar no navegador**

Run: `npm run dev` e abra `http://localhost:3000/cobranca`:
1. As abas **Cobranças** / **Planos** aparecem no topo da seção. "Cobranças" mostra a tabela filtrada de sempre.
2. Clique em **Planos**: lista os 4 planos com duração, nº de alunos e valor/mês.
3. Clique **+ Novo plano**, crie "Diário / 39,90 / 1 mês" → aparece na lista.
4. Clique **Editar** no Mensal, troque o valor para 139,90 → salva e a linha atualiza.
5. Abra `http://localhost:3000/matricula` → o plano novo aparece na escolha de planos e o Mensal está com o valor novo.
6. Clique **Arquivar** no plano novo em `/cobranca` → fica esmaecido; em `/matricula` ele **não** aparece mais.

Expected: todos os passos funcionam; o valor editado reflete na matrícula (confirma "vale só para novos").

- [ ] **Step 5: Commit**

```bash
git add src/components/cobranca/CobrancaTabs.tsx "src/app/(app)/cobranca/page.tsx"
git commit -m "feat(cobranca): aba de planos com criar/editar/arquivar e contagem de alunos"
```

---

## Verificação final

- [ ] **Build completo**

Run: `npm run build`
Expected: build conclui sem erros de tipo/lint.

- [ ] **Smoke test do fluxo completo (modo mock)**

1. `/cobranca` → aba Planos → criar um plano e editar o valor de um existente.
2. `/matricula` → matricular um lead no plano editado → modal com link do WhatsApp.
3. `curl` do webhook `PAYMENT_RECEIVED` com o `asaasId` da matrícula (veja o link/pessoa) → aluno vira `ativo`.
4. `/painel` e `/relatorios` continuam carregando sem erro.

- [ ] **(Opcional) Teste contra o sandbox real**

Com a chave no `.env.local`:
```
ASAAS_API_KEY=$aact_...
ASAAS_ENV=sandbox
```
Reinicie o dev server e refaça uma matrícula. Confira no painel do Asaas sandbox que o **cliente** e a **assinatura** foram criados, e que o `linkPagamento` abre a fatura real.

---

## Cobertura do spec (self-review)

| Requisito do spec | Task |
|-------------------|------|
| Planos como estado editável no store | Task 3 |
| API REST de planos (GET/POST/PATCH, sem DELETE/arquivar) | Tasks 6, 7 |
| Cliente Asaas — assinaturas | Task 5 |
| Fluxo de matrícula ligado ao Asaas + waLink | Tasks 8, 9 |
| Webhook funcional (pago/atrasado) | Tasks 4, 10 |
| Aba "Planos" dentro de /cobranca + contagem de alunos | Tasks 11, 12 |
| Editar valor "vale só para novos" | Task 7 (nota) + Task 12 (passo 5 valida) |
| Configuração de ambiente (.env.example, gitignore) | Task 1 |
| Fallback mockado sem chave | Task 5 (todas as funções Asaas) |

**Desvio consciente do spec:** o spec listava `POST /api/matriculas` como rota nova. O plano integra a lógica Asaas no fluxo já existente `PATCH /api/pessoas/[id]` (`acao: "matricular"`) para evitar duplicação — mesma funcionalidade, menos superfície. As telas `retencao`, `relatorios`, `clientes/[id]` e o componente `FichaCliente` entraram no escopo por dependerem de `planoPorId`, que saiu de `mock-data` para o store.
