# Kit de Instalação Windows do coliseu-agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar via `npm run make-kit` uma pasta offline-installable que instala o access-agent como serviço Windows num único contato AnyDesk, com agente endurecido para queda de internet.

**Architecture:** Bundle esbuild único (`coliseu-agent.cjs`, zero deps) + NSSM como service manager + scripts .bat de install/update/uninstall/status + Node MSI embutido. Hardening: etapas do tick independentes, log de transição ONLINE/OFFLINE, cursor só avança após push bem-sucedido.

**Tech Stack:** Node 20+ (`--env-file` nativo), esbuild (já em devDeps via tsx; adicionar explícito), NSSM 2.24, batch scripts.

Spec: `docs/superpowers/specs/2026-07-07-agent-install-kit-design.md`

---

### Task 1: Hardening offline do agente

**Files:**
- Create: `access-agent/src/env-check.ts`
- Create: `access-agent/src/env-check.test.ts`
- Modify: `access-agent/src/backend-client.ts` (pushEvent lança em !ok; heartbeat idem)
- Modify: `access-agent/src/agent.ts` (tick em etapas independentes, tracker ONLINE/OFFLINE, cursor pós-push, flag `--check`)

- [ ] **Step 1: Teste falhando de env-check**

```ts
// access-agent/src/env-check.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnv } from "./env-check.js";

test("fake: exige DEVICE_ID", () => {
  assert.deepEqual(checkEnv({}), ["DEVICE_ID"]);
  assert.deepEqual(checkEnv({ DEVICE_ID: "x" }), []);
});

test("controlid: exige IDFACE_HOST/PASS, BACKEND_URL e AGENT_TOKEN", () => {
  const missing = checkEnv({ ADAPTER: "controlid", DEVICE_ID: "x" });
  assert.deepEqual(missing.sort(), ["AGENT_TOKEN", "BACKEND_URL", "IDFACE_HOST", "IDFACE_PASS"]);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --import tsx --test src/env-check.test.ts` → FAIL (módulo não existe)

- [ ] **Step 3: Implementar `env-check.ts`**

```ts
export function checkEnv(env: Record<string, string | undefined>): string[] {
  const missing: string[] = [];
  if (!env.DEVICE_ID) missing.push("DEVICE_ID");
  if ((env.ADAPTER ?? "fake").toLowerCase() === "controlid") {
    for (const k of ["IDFACE_HOST", "IDFACE_PASS", "BACKEND_URL", "AGENT_TOKEN"])
      if (!env[k]) missing.push(k);
  }
  return missing;
}
```

- [ ] **Step 4: Teste passa** — mesmo comando, PASS.

- [ ] **Step 5: backend-client lança em !ok** — `heartbeat` e `pushEvent` passam a checar `res.ok` e lançar `Error("HTTP <status>")`; assim o agente não avança cursor sobre push falho.

- [ ] **Step 6: agent.ts em etapas independentes**

Estrutura do novo tick (código real na implementação):
- `--check` no boot: imprime campos faltantes e sai 1 (usado pelo install.bat); sem faltantes imprime ok e sai 0.
- Tracker `nuvemOnline: boolean | null`; helper `logTransicao(ok)` imprime 1 linha só na mudança de estado com timestamp ISO.
- Etapa A (nuvem): heartbeat em try/catch próprio → alimenta tracker.
- Etapa B (nuvem): pull/execução/ack de comandos em try/catch próprio.
- Etapa C (device+nuvem): `pullAccessEvents(cursor)`; push evento a evento; se um push falhar, interrompe o flush SEM salvar cursor além do último enviado (salva cursor do último evento pushado com sucesso; eventos seguem no device para a próxima tentativa).

- [ ] **Step 7: Smoke** — `ADAPTER=fake DEVICE_ID=x` com backend fora: loga `OFFLINE` uma vez (não a cada tick) e continua; com backend de pé volta a `ONLINE` e sincroniza. `npm test` e `npm run typecheck` passam.

- [ ] **Step 8: Commit** — `feat(agent): hardening offline (etapas independentes, log ONLINE/OFFLINE, cursor pós-push, --check)`

### Task 2: Templates do kit

**Files:**
- Create: `access-agent/kit-templates/install.bat`, `update.bat`, `uninstall.bat`, `status.bat`, `env.template`, `INSTALL.md`

- [ ] **Step 1: `env.template`** — todas as vars com comentário; `ADAPTER=controlid` default; `IDFACE_HOST=` vazio com instrução "preencher na academia".

- [ ] **Step 2: `install.bat`** (essência; encoding ANSI, `chcp 65001` no topo):

```bat
@echo off & setlocal
cd /d "%~dp0"
net session >nul 2>&1 || (echo [ERRO] Execute como administrador & pause & exit /b 1)
if not exist .env (echo [ERRO] Falta o arquivo .env & pause & exit /b 1)
set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" (
  echo [1/4] Instalando Node.js LTS...
  msiexec /i node-lts.msi /qn /norestart || (echo [ERRO] Falha ao instalar Node & pause & exit /b 1)
)
echo [2/4] Validando configuracao...
"%NODE%" --env-file=.env coliseu-agent.cjs --check || (pause & exit /b 1)
echo [3/4] Registrando servico ColiseuAgent...
if not exist logs mkdir logs
nssm stop ColiseuAgent >nul 2>&1 & nssm remove ColiseuAgent confirm >nul 2>&1
nssm install ColiseuAgent "%NODE%" --env-file=.env coliseu-agent.cjs
nssm set ColiseuAgent AppDirectory "%~dp0."
nssm set ColiseuAgent AppStdout "%~dp0logs\agent.log"
nssm set ColiseuAgent AppStderr "%~dp0logs\agent.log"
nssm set ColiseuAgent AppRotateFiles 1
nssm set ColiseuAgent AppRotateBytes 1048576
nssm set ColiseuAgent AppRestartDelay 10000
nssm set ColiseuAgent Start SERVICE_AUTO_START
echo [4/4] Iniciando...
nssm start ColiseuAgent && timeout /t 5 >nul
type logs\agent.log 2>nul
echo. & echo Confira no dashboard /acesso se a catraca esta ONLINE. & pause
```

- [ ] **Step 3: `update.bat`** — `nssm stop` → copia `new\coliseu-agent.cjs` por cima (ou instrui a colar o novo .cjs na pasta antes) → `nssm start` → tail do log. `uninstall.bat` — stop + remove + mensagem. `status.bat` — `nssm status` + últimas 30 linhas do log via PowerShell `Get-Content -Tail`.

- [ ] **Step 4: `INSTALL.md`** — checklist do primeiro contato (5 passos da spec) + tabela de problemas comuns (porta, IP, token).

- [ ] **Step 5: Commit** — `feat(agent-kit): templates de instalação Windows (install/update/uninstall/status/env/INSTALL.md)`

### Task 3: make-kit

**Files:**
- Create: `access-agent/scripts/make-kit.mjs`
- Modify: `access-agent/package.json` (script `make-kit`, devDep `esbuild`)

- [ ] **Step 1: Script** — passos do `make-kit.mjs`:
  1. `esbuild.build({ entryPoints:["src/agent.ts"], bundle:true, platform:"node", target:"node20", format:"cjs", outfile:"dist/coliseu-agent-kit/coliseu-agent.cjs" })`
  2. Baixa `https://nssm.cc/release/nssm-2.24.zip` (cache em `dist/.cache/`), extrai `win64/nssm.exe` (PowerShell `Expand-Archive`).
  3. Baixa Node LTS MSI pinado (`https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi`, cache idem) → `node-lts.msi`.
  4. Copia `kit-templates/*` (env.template → `.env`).
  5. Imprime resumo com tamanhos.

- [ ] **Step 2: Rodar** — `npm run make-kit` → pasta completa com 9 arquivos.

- [ ] **Step 3: Verificar bundle** — `node --env-file=.env dist/coliseu-agent-kit/coliseu-agent.cjs --check` → lista campos faltantes e sai 1 (esperado com template vazio). Preencher `.env` fake e ver sair 0.

- [ ] **Step 4: Commit** — `feat(agent-kit): make-kit gera kit offline-installable (bundle+nssm+node msi+templates)`

### Task 4: Ensaio geral neste PC

- [ ] **Step 1: Bundle roda de verdade** — `.env` com `ADAPTER=fake`, `DEVICE_ID` real do banco local, `BACKEND_URL=http://localhost:3001` → device ONLINE no `/acesso` local; parar processo.
- [ ] **Step 2: Serviço (se o shell tiver elevação)** — `install.bat`; sem elevação: validar `nssm install` manualmente depois — documentar resultado honesto.
- [ ] **Step 3: Commit final e atualização do README do access-agent** (seção "Kit de instalação").

## Self-review

- Spec coverage: bundle ✓ (T3), NSSM/serviço ✓ (T2/T4), .env+validação ✓ (T1/T2), hardening offline ✓ (T1), primeiro contato/INSTALL.md ✓ (T2), testes ✓ (T1 S7, T3 S3, T4). Modos de falha cobertos pelos comportamentos de T1/T2.
- Sem placeholders; nomes consistentes (`ColiseuAgent`, `coliseu-agent.cjs`, `checkEnv`).
