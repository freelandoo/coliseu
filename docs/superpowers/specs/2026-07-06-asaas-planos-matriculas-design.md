# Integração Asaas: matrículas, links de pagamento e gestão de planos

**Data:** 2026-07-06
**Projeto:** Coliseu CRM — Academia Coliseu Team

## Objetivo

Conectar a plataforma à API **sandbox** do Asaas para operar de ponta a ponta:
matrícula recorrente (assinatura), link de pagamento no WhatsApp e confirmação
por webhook. Além disso, dar à recepção uma **aba de gestão de planos** dentro
de `/cobranca` para criar novos planos, ver os existentes e editar valores.

## Decisões de design (travadas)

| Tema | Decisão |
|------|---------|
| Cobrança da matrícula | **Assinatura recorrente** (Asaas Subscriptions, cycle `MONTHLY`) |
| Links de pagamento | **Link por cobrança + botão WhatsApp** (invoiceUrl real da 1ª cobrança) |
| Gestão de planos | **Aba dentro de `/cobranca`** (não rota separada) |
| Editar valor do plano | **Vale só para novas** matrículas/renovações; assinaturas Asaas já criadas não mudam |
| Chave Asaas | Fornecida pelo usuário, gravada em `.env.local` (gitignored) |

## Arquitetura

O app segue o padrão: **Server Component (página)** lê do `store` em memória →
passa para **Client Component** → mutações via `fetch` + `router.refresh()`.
O `store` é a fonte única da verdade, seedado dos mocks e persistido em
`globalThis` (sobrevive ao hot-reload; zera só em restart do processo).

### 1. Planos viram estado editável

Hoje `planos` é um `const` estático em `lib/mock-data.ts`, lido em todo lugar via
`planoPorId()`. Para permitir criar/editar, ele migra para o `store` (mesmo
mecanismo de `cobrancas`/`despesas`).

- `mock-data.ts`: passa a exportar apenas `planosSeed` (semente). `planoPorId`
  sai daqui.
- `store.ts`: adiciona `planos` ao `__coliseuDB` (seedado de `planosSeed`) e
  expõe `listarPlanos()`, `planoPorId()`, `criarPlano()`, `atualizarPlano()`.
- `types.ts`: `Plano` ganha campos opcionais `ativo?: boolean` e `descricao?`.
- Consumidores atualizados para importar `planoPorId` do `store`:
  `matricula/page.tsx`, `cobranca/page.tsx` (e qualquer outro import de
  `planos`/`planoPorId` a partir de `mock-data`).

**Contrato do store (planos):**
- `listarPlanos(): Plano[]` — todos (inclui inativos; a UI filtra).
- `planoPorId(id): Plano | undefined`.
- `criarPlano(input: NovoPlano): Plano` — gera `id` (`p-<timestamp36>`), `ativo: true`.
- `atualizarPlano(id, patch: Partial<Plano>): Plano | undefined` — preserva `id`.

`NovoPlano = { nome; valorMensal; duracaoMeses; descricao? }`.

### 2. API REST de planos

Espelha o padrão de `/api/despesas`.

- `GET /api/planos` → `listarPlanos()`.
- `POST /api/planos` → valida `nome` (obrigatório) e `valorMensal > 0`,
  `duracaoMeses >= 1`; retorna 201 com o plano.
- `PATCH /api/planos/[id]` → aplica patch (valor/nome/duração/ativo); 404 se não
  existe. **Não** propaga o novo valor para assinaturas Asaas existentes.
- **Sem DELETE**: "arquivar" via `PATCH { ativo: false }`, porque alunos
  referenciam `planoId`.

### 3. Cliente Asaas — assinaturas

Em `lib/asaas.ts`, mantendo o **fallback mockado** quando não há
`ASAAS_API_KEY` (mesma convenção atual):

- `criarAssinatura(input): Promise<AsaasSubscription>` → `POST /subscriptions`
  com `{ customer, billingType: "PIX", cycle: "MONTHLY", value, nextDueDate,
  description }`.
- `primeiraCobrancaAssinatura(subscriptionId): Promise<AsaasCharge>` →
  `GET /subscriptions/{id}/payments`, retorna a 1ª cobrança (para extrair a
  `invoiceUrl` real que vai no WhatsApp).
- Reaproveita `criarOuLocalizarCliente` e `linkPagamentoWhatsApp` (já existem).
- Base já resolvida por `ASAAS_ENV` (`api-sandbox` vs `api`).

Novo tipo `AsaasSubscription = { id; customer; value; cycle; nextDueDate;
status }`.

### 4. Fluxo de matrícula ligado ao Asaas

Nova rota `POST /api/matriculas` (server-side, onde a chave vive):

1. Recebe `{ pessoaId, planoId }`.
2. `criarOuLocalizarCliente(pessoa)` → `customerId`.
3. `criarAssinatura({ customer, value: plano.valorMensal, ... })` → `assinaturaId`.
4. `primeiraCobrancaAssinatura(assinaturaId)` → `invoiceUrl`.
5. `store.matricularPessoa(pessoaId, planoId, { asaasId, assinaturaId,
   linkPagamento })` — transição lead→aluno + cria a cobrança com dados **reais**.
6. Responde `{ pessoa, waLink }` para a recepção enviar no WhatsApp.

**Refatorar `store.matricularPessoa`**: hoje grava um `asaasId`/link fake.
Passa a aceitar um segundo argumento opcional com os dados do Asaas; sem ele
(modo mock), mantém o comportamento atual. `Cobranca` ganha
`assinaturaId?: string`.

O componente `MatriculaFlow` passa a submeter a matrícula para
`POST /api/matriculas` (hoje o ponto de submit precisa ser localizado e ligado
a essa rota) e usa o `waLink` retornado.

### 5. Webhook Asaas funcional

Implementa os `TODO` de `api/webhooks/asaas/route.ts`:

- `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `store.marcarCobrancaPaga(asaasId)`:
  acha a cobrança pelo `asaasId` (ou `assinaturaId` do payload), marca `pago` e
  o aluno como `ativo`.
- `PAYMENT_OVERDUE` → `store.marcarCobrancaAtrasada(asaasId)`: cobrança
  `atrasado` + aluno `inadimplente`.
- Mantém a validação do `ASAAS_WEBHOOK_TOKEN` já existente.

**Novas funções do store:** `marcarCobrancaPaga(asaasId)`,
`marcarCobrancaAtrasada(asaasId)`.

### 6. Aba "Planos" dentro de /cobranca

`cobranca/page.tsx` passa a alternar entre **Cobranças** (conteúdo atual) e
**Planos**. Novo client component `components/cobranca/GestaoPlanos.tsx`
(padrão modal do `CustosView`):

- Lista os planos: nome, valor mensal, duração (meses), **nº de alunos ativos**
  naquele plano (contado no server e passado como prop).
- Botão **"+ Novo plano"** → modal (nome, valor, duração, descrição opcional) →
  `POST /api/planos`.
- **Editar valor** por linha → modal/inline → `PATCH /api/planos/[id]`.
- **Arquivar** plano inativo (`PATCH { ativo: false }`); inativos aparecem
  esmaecidos e não são oferecidos em novas matrículas.

A alternância Cobranças/Planos pode ser via tabs simples (estado client) ou
`?tab=` na URL — decisão de implementação, ambos aceitáveis.

### 7. Configuração de ambiente

- `.env.local` (gitignored):
  `ASAAS_API_KEY=$aact_...`, `ASAAS_ENV=sandbox`, `ASAAS_WEBHOOK_TOKEN=...`
- `.env.example`: mesmas chaves **sem** valores/segredos, documentadas.
- Confirmar que `.env*.local` está no `.gitignore` (padrão do Next) para a chave
  nunca ir para o git.

## Arquivos

**Novos:**
- `src/app/api/planos/route.ts`
- `src/app/api/planos/[id]/route.ts`
- `src/app/api/matriculas/route.ts`
- `src/components/cobranca/GestaoPlanos.tsx`
- `.env.example`

**Alterados:**
- `src/lib/store.ts` (planos + funções de cobrança do webhook + matrícula)
- `src/lib/mock-data.ts` (`planosSeed`, remove `planoPorId`)
- `src/lib/types.ts` (`Plano.ativo/descricao`, `NovoPlano`, `Cobranca.assinaturaId`, tipos Asaas)
- `src/lib/asaas.ts` (assinaturas)
- `src/app/(app)/cobranca/page.tsx` (aba + contagem por plano)
- `src/app/(app)/matricula/page.tsx` (import de `planoPorId`)
- `src/app/api/webhooks/asaas/route.ts` (implementa TODOs)
- `src/components/matricula/MatriculaFlow.tsx` (submit → `/api/matriculas`)

## Fora de escopo (YAGNI)

- Persistência em banco de dados real (segue in-memory como o resto do app).
- Autenticação/perfis de acesso.
- Taxa de matrícula avulsa separada da assinatura (pode virar iteração futura).
- Atualização em massa de assinaturas Asaas ao editar valor de plano.
- Payment Links fixos/reutilizáveis por plano.

## Critérios de sucesso

1. Criar um plano novo pela aba Planos e ele aparecer disponível na matrícula.
2. Editar o valor de um plano e novas matrículas usarem o novo valor.
3. Matricular uma pessoa gerar assinatura no sandbox Asaas e um `waLink` com a
   `invoiceUrl` real.
4. Webhook de pagamento confirmado mover o aluno para `ativo` e a cobrança para
   `pago`.
5. Sem `ASAAS_API_KEY`, tudo continua funcionando em modo mockado.
