# Deploy — Coliseu

App: Next.js 16 + Prisma 6 + Postgres. Alvo recomendado: **Railway** (app sempre-on + Postgres gerenciado no mesmo projeto; o agente da catraca faz polling HTTP e não exige nada além de uma URL pública).

## Princípios operacionais

- **`npm start` NÃO roda migration.** Subir o app e migrar o banco são decisões separadas; uma migration com falha não pode impedir o app de subir no schema atual.
- Migrations são **forward-only**: reverter = criar uma nova migration que desfaz (`prisma migrate dev --name revert_xyz`), nunca editar/apagar uma aplicada.
- O rastreamento (checksum, lock de concorrência, abort em falha) é do próprio Prisma, na tabela `_prisma_migrations` — não usamos runner próprio.

## Comandos

| Comando | O que faz | Quando |
|---|---|---|
| `npm run db:migrate:status` | Lista migrations aplicadas × pendentes | Antes e depois de todo deploy |
| `npm run db:migrate:deploy` | Aplica as pendentes (idempotente, com lock) | ANTES de subir a versão nova do app |
| `npm run build && npm start` | Build e boot de produção | Após o migrate |
| `npm run db:seed` | **NUNCA em produção** (apaga e recria dados de demo) | só dev |

Ordem de release: `db:migrate:status` → `db:migrate:deploy` → deploy do app → `db:migrate:status` de novo → smoke.

## Variáveis de ambiente (produção)

Ver `.env.example`. Obrigatórias em produção:

- `DATABASE_URL` — Postgres gerenciado (Railway injeta; use `?connection_limit=5` se ficar em serverless)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AGENT_TOKEN` — **obrigatório**: sem ele as rotas `/api/agent/*` respondem 503 em produção; o mesmo valor vai no `.env` do agente na academia
- `ASAAS_ENV=production` + `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN` — sem elas o billing fica em modo demonstração
- `FREELANDOO_API_TOKEN` — fallback opcional; o token da integração Freelandoo agora é gerado/rotacionado pelo ADMIN no card "Integração Freelandoo" do painel (tabela `ApiToken` tem precedência sobre esta env). A env só é usada enquanto nenhum token tiver sido gerado pelo painel.
- `EVOLUTION_URL` + `EVOLUTION_API_KEY` + `WHATSAPP_WEBHOOK_SECRET` + `PUBLIC_APP_URL` — atendimento no WhatsApp; sem elas a Captação mostra "WhatsApp não configurado" e o resto do app segue normal

## Atendimento WhatsApp (Evolution API)

Design: `docs/superpowers/specs/2026-07-22-whatsapp-atendimento-design.md`.

Dois serviços novos **no mesmo projeto Railway** do Coliseu:

### 1. `redis`

Template Redis do Railway (com volume). Serve de cache de sessão do Baileys — é o
que segura a reconexão sem repareamento. O app Next **não** usa Redis.

### 2. `evolution-api`

- Imagem: `evoapicloud/evolution-api:v2.3.7`
- Volume: `/evolution/instances` (a sessão do WhatsApp vive aqui — sem volume, todo
  restart pede QR de novo)
- **Sem domínio público.** Só rede interna; quem fala com ela é o Coliseu.
- Variáveis:

```
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}?schema=evolution
DATABASE_CONNECTION_CLIENT_NAME=evolution
AUTHENTICATION_API_KEY=<gere: openssl rand -hex 32>
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
CACHE_REDIS_PREFIX_KEY=evolution
```

O schema `evolution` isola as tabelas da Evolution das do Prisma (`public`) no
mesmo Postgres — não precisa de um segundo banco.

### 3. No serviço `coliseu`

```
EVOLUTION_URL=http://evolution-api.railway.internal:8080
EVOLUTION_API_KEY=<mesmo AUTHENTICATION_API_KEY acima>
EVOLUTION_INSTANCE=coliseu
WHATSAPP_WEBHOOK_SECRET=<gere: openssl rand -hex 32>
PUBLIC_APP_URL=https://coliseu-production.up.railway.app
```

O webhook é registrado sozinho na Evolution quando a recepção clica em
**Conectar WhatsApp** — nada para configurar na mão.

### Operação

- Conectar: Captação → **Conectar WhatsApp** → ler o QR no celular **da academia**
  (não use número pessoal: a sessão fica no servidor).
- O QR expira em ~20s e se renova sozinho no modal.
- Perder o volume `/evolution/instances` = repareamento por QR. Não perde
  histórico: conversas e mensagens ficam no Postgres do Coliseu.
- Nenhuma mensagem sai sem clique da recepção. Há teste de arquitetura
  (`src/lib/whatsapp/sem-automacao.test.ts`) que falha se alguém ligar a ingestão
  ao envio.

## Agente da catraca (recepção da academia)

O jeito recomendado de obter o kit: **Perfil → card "Agente da recepção" → Download do kit** (só ADMIN). O ZIP já vem com `BACKEND_URL` (domínio atual), `AGENT_TOKEN` e `DEVICE_ID` preenchidos no `.env` — na academia só falta `IDFACE_HOST/USER/PASS`. Para o botão funcionar em produção, o build do deploy precisa gerar o kit: `npm --prefix access-agent ci && npm run make-kit` (baixa Node MSI + NSSM com verificação de checksum; o resultado fica em `access-agent/dist/coliseu-agent-kit`, fora do git).

Alternativa manual — o kit (`access-agent/dist/coliseu-agent-kit`, gerado por `npm run make-kit`) roda como serviço Windows. No `.env` do kit aponte:

```
BACKEND_URL=https://<dominio-do-app>
AGENT_TOKEN=<mesmo valor do backend>
DEVICE_ID=<id do AccessDevice criado no app>
ADAPTER=controlid   # fake apenas para teste
IDFACE_HOST/USER/PASS=<do iDFace na LAN>
```

O agente só faz requisições de SAÍDA (polling) — não precisa de porta aberta na academia.

## Checklist pré-deploy

- [ ] Migrations pendentes revisadas (nada destrutivo sem plano)
- [ ] `npm test` e `npm run build` verdes localmente
- [ ] Envs novas criadas no host ANTES do deploy
- [ ] Plano de rollback: qual migration reversa se der errado

## Checklist pós-deploy

- [ ] `db:migrate:status` sem pendências
- [ ] `/login` responde 200
- [ ] Heartbeat do agente chega (device ONLINE no dashboard `/acesso`)
- [ ] Webhook Asaas de teste processado sem duplicar cobrança
- [ ] Sem comando DEAD_LETTER inesperado no `/acesso`
- [ ] WhatsApp conectado em `/captacao` e mensagem de teste aparecendo em `/captacao/atendimento`

## Rollback

1. App: redeploy da versão anterior (Railway mantém o histórico de deploys).
2. Banco: migration reversa nova (`prisma migrate dev --name revert_xyz` em dev → `db:migrate:deploy` em prod). Nunca `migrate reset` em produção.
3. Catraca: com o backend fora, o agente entra em contingência — o iDFace segue decidindo localmente com a última base sincronizada; nada a fazer na academia.
