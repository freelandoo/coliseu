# Kit de instalação do coliseu-agent (Windows) — Design

Data: 2026-07-07 · Status: aprovado pelo usuário

## Problema

O CRM roda na nuvem (Vercel/Railway + Postgres gerenciado); a catraca (Control iD
iDFace Pro + DIMEP) fica na LAN da academia, atrás de NAT. O elo entre os dois é o
`access-agent`, que precisa rodar **num PC Windows da recepção** — máquina
compartilhada, sujeita a reinício/logoff — e ser instalado **num único contato via
AnyDesk**, sem depender de downloads no local.

## Decisões (com o usuário)

- **Máquina alvo:** PC da recepção, Windows — desenhar para o pior caso.
- **Atualização:** via AnyDesk + `update.bat` (sem auto-update na v1; repo não tem remote).
- **Abordagem:** A — bundle único + serviço Windows via NSSM (aprovada).
- **Primeiro contato:** kit 100% offline-installable — instalador do Node vai dentro.

## Arquitetura

### Kit gerado por `npm run make-kit` (em `access-agent/`)

```
dist/coliseu-agent-kit/
├── coliseu-agent.cjs   bundle esbuild do agente (zero deps de runtime)
├── .env                template preenchido pelo operador ANTES da visita
├── node-lts.msi        instalador Node LTS (baixado no make-kit, não na academia)
├── nssm.exe            service manager (baixado no make-kit)
├── install.bat         instala Node se faltar → valida .env → cria serviço → inicia
├── update.bat          para serviço → troca coliseu-agent.cjs → reinicia
├── uninstall.bat       remove o serviço
├── status.bat          estado do serviço + tail do log
└── INSTALL.md          checklist do primeiro contato via AnyDesk
```

O agente não tem dependências de produção (fetch nativo, node:fs), então o bundle
esbuild é autossuficiente. Sem `npm install` na academia — elimina node_modules,
rede e antivírus da equação.

### Serviço Windows (NSSM)

- Nome `ColiseuAgent`; comando `node --env-file=.env coliseu-agent.cjs`
  (`--env-file` nativo do Node ≥20.6 — zero código de parsing).
- Auto-start no boot, roda sem usuário logado, restart automático (delay 10s).
- stdout/stderr → `logs\agent.log` com rotação nativa do NSSM.

### Config (.env)

`ADAPTER=controlid`, `BACKEND_URL`, `AGENT_TOKEN`, `DEVICE_ID`, `IDFACE_HOST`,
`IDFACE_USER`, `IDFACE_PASS`, opcionais `IDFACE_RULE_ID`, `IDFACE_DOOR_ID`,
`INTERVALO_MS`. O operador preenche tudo antes da visita, exceto `IDFACE_HOST`
(descoberto na tela do aparelho: Menu → Rede). `install.bat` valida os campos
obrigatórios e aborta com mensagem clara se faltar algum.

### Hardening offline do agente (entra no bundle)

Hoje o `tick()` aborta inteiro se o heartbeat falhar. Muda para:

- Etapas independentes: heartbeat, comandos e eventos cada um com seu try/catch;
  nuvem fora não impede falar com a catraca e vice-versa.
- Log de transição de estado (1 linha por transição, sem spam):
  `OFFLINE: nuvem inacessível — catraca segue decidindo localmente` /
  `ONLINE: reconectado`.
- Cursor de eventos permanece em disco (`.agent-cursor-<DEVICE_ID>`); giros durante
  queda ficam no iDFace e sincronizam na volta (dedupe por deviceEventId no backend).

## Modos de falha

| Falha | Comportamento |
|---|---|
| Internet cai | catraca decide sozinha (standalone); agente loga OFFLINE e segue; sincroniza na volta |
| PC reinicia/logoff | serviço volta no boot, sem login |
| Agente trava | NSSM reinicia em 10s |
| `.env` incompleto | install.bat aborta antes de criar o serviço, apontando o campo |
| IP da catraca errado | log aponta IDFACE_HOST explicitamente |

## Fluxo do primeiro contato (INSTALL.md)

1. Preencher `.env` antes da visita (BACKEND_URL, AGENT_TOKEN, DEVICE_ID…).
2. AnyDesk → copiar kit para `C:\coliseu-agent\`.
3. Descobrir IP do iDFace no aparelho → completar `IDFACE_HOST` no `.env`.
4. `install.bat` como administrador.
5. Confirmar no dashboard `/acesso` da nuvem: catraca ONLINE.

## Testes

- Ensaio geral no PC de desenvolvimento (Windows): `make-kit` → `install.bat` →
  serviço ONLINE no `/acesso` local → `uninstall.bat`.
- Testes existentes do adapter continuam passando (`npm test` no access-agent).

## Fora de escopo (v1)

- Auto-update pela internet; executável único .exe (Node SEA); mTLS (infra);
  GitHub remote (recomendado criar depois, para update via release).
