# Coliseu — access-agent (simulado)

Serviço Node/TS que fala o protocolo backend↔agente da catraca **sem hardware**. Faz
heartbeat, puxa `DeviceCommand`, executa via `FakeDeviceAdapter`, dá ack e empurra
`AccessEvent` simulados — fechando o ciclo até o dashboard `/acesso` e a presença/retenção.

Na **Fase 5**, o driver real do Control iD iDFace entra trocando **apenas**
`src/adapters/` (o loop, o cliente HTTP e o backend permanecem iguais).

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

## É um simulador

O `FakeDeviceAdapter` não faz nenhum I/O com dispositivo real: mantém um set de usuários
habilitados em memória e gera `deviceEventId` sintéticos. Serve para validar o protocolo
e o dashboard ponta a ponta antes do hardware.
