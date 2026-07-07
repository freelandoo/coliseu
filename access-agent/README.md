# Coliseu — access-agent (simulado)

Serviço Node/TS que fala o protocolo backend↔agente da catraca **sem hardware**. Faz
heartbeat, puxa `DeviceCommand`, executa via `FakeDeviceAdapter`, dá ack e empurra
`AccessEvent` simulados — fechando o ciclo até o dashboard `/acesso` e a presença/retenção.

Na **Fase 5** entrou o driver real do Control iD iDFace (`ADAPTER=controlid`) — veja a
seção abaixo. O loop (`agent.ts`) agora opera pela interface `AccessDeviceAdapter` e capta
giros por `pullAccessEvents`, então fake e iDFace passam pelo mesmo caminho.

## Pré-requisitos

- Backend Coliseu rodando (`npm run dev`, porta 3000) com Postgres de pé e `npm run db:seed`
  executado (cria o `AccessDevice` "Catraca Principal" e os mapeamentos).
- Node 20+ (usa `fetch` nativo).

## Variáveis de ambiente

| Var | Default | Descrição |
|---|---|---|
| `DEVICE_ID` | — (obrigatório) | id do `AccessDevice` (veja no banco ou no dashboard `/acesso`). |
| `BACKEND_URL` | `http://localhost:3000` | base do backend. |
| `AGENT_TOKEN` | (vazio) | token `x-agent-token`. Em dev pode ficar vazio; em produção é exigido. |
| `SEED_ENABLE` | (vazio) | lista de `externalUserId` a habilitar no fake no boot (ex.: `1001,1002,1003`) para gerar giros já no primeiro ciclo. |
| `INTERVALO_MS` | `5000` | intervalo entre ciclos. |

## Como rodar

```bash
cd access-agent
npm install
DEVICE_ID=<id-do-AccessDevice> SEED_ENABLE=1001,1002,1003 npm start
```

A cada ciclo o agente: (1) manda heartbeat (device fica ONLINE), (2) puxa comandos
pendentes e os executa no adapter fake + ack (comandos de provisionamento marcam o
mapping como `IN_SYNC`), (3) ocasionalmente gera um giro simulado de um usuário
habilitado, que vira `AccessEvent` ALLOWED e atualiza a `ultimaPresenca` da matrícula.

## É um simulador (modo fake)

O `FakeDeviceAdapter` não faz nenhum I/O com dispositivo real: mantém um set de usuários
habilitados em memória e gera `deviceEventId` sintéticos. Serve para validar o protocolo
e o dashboard ponta a ponta antes do hardware.

## Modo Control iD (Fase 5) — driver real do iDFace

Com `ADAPTER=controlid` o agente fala a API REST (`.fcgi`) do **Control iD iDFace Pro** na
LAN da academia: login/sessão, CRUD de `users`, habilita/desabilita por vínculo com uma
`access_rule`, dispara enrollment facial (`remote_enroll`), aciona a catraca DIMEP pelo MAE
(`execute_actions`) e **capta os giros por polling de `access_logs`** (`load_objects`),
mantendo um cursor local em `.agent-cursor-<DEVICE_ID>` para não reprocessar após restart.

| Var | Default | Descrição |
|---|---|---|
| `ADAPTER` | `fake` | `controlid` para o driver real. |
| `IDFACE_HOST` | — (obrigatório em controlid) | IP/host do iDFace (com ou sem `http://`). |
| `IDFACE_USER` | `admin` | usuário da API do device. |
| `IDFACE_PASS` | `admin` | senha da API do device. |
| `IDFACE_RULE_ID` | `1` | `access_rule` usada para habilitar o aluno. |
| `IDFACE_DOOR_ID` | `1` | portal físico acionado (`door=N`). |

```bash
ADAPTER=controlid IDFACE_HOST=192.168.0.50 IDFACE_USER=admin IDFACE_PASS=<senha> \
  DEVICE_ID=<id-do-AccessDevice> npm start
```

Notas:
- **Polling vs Monitor:** captamos giros por `access_logs`. Como `access_logs` não traz uma
  linha explícita de "giro confirmado" (isso só existe no `catra_event` do Monitor push),
  adotamos `Acesso concedido ⇒ physicallyPassed`. A tradução está isolada em
  `src/adapters/controlid/mapping.ts` para calibração.
- **mTLS agente↔backend:** fora do escopo do código; a autenticação continua por
  `x-agent-token`. mTLS de verdade termina num reverse-proxy/ingress na frente do backend.

## Testes

```bash
npm test   # driver Control iD (fetch mockado) + validação de env
```

## Kit de instalação (Windows, PC da academia)

```bash
npm run make-kit   # gera dist/coliseu-agent-kit/ (precisa de internet p/ NSSM e Node MSI)
```

Gera uma pasta **offline-installable** (~30 MB): bundle único `coliseu-agent.cjs`
(zero deps), `nssm.exe` (SHA-256 verificado), instalador do Node LTS (hash conferido
no SHASUMS oficial), `.env` template e scripts `install/update/uninstall/status.bat`.
Instalação num único contato via AnyDesk: preencha o `.env`, copie a pasta pra
`C:\coliseu-agent\` e rode `install.bat` como administrador — vira o serviço Windows
`ColiseuAgent` (auto-start, restart em falha, log rotacionado em `logs\agent.log`).
Passo a passo completo: `kit-templates/INSTALL.md` (vai dentro do kit).

Spec/decisões: `docs/superpowers/specs/2026-07-07-agent-install-kit-design.md`.
