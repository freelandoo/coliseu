# Atendimento WhatsApp na Captação — design

Data: 2026-07-22
Status: aprovado (decisões recomendadas tomadas pelo agente a pedido do usuário)

## Objetivo

Ligar o WhatsApp da academia ao CRM. A recepção conecta o número por QR Code
dentro do Coliseu, e a partir daí toda conversa recebida vira **lead registrado**
e **histórico de conversa** dentro da Captação. A recepção lê o histórico,
responde manualmente pela própria tela e classifica o interesse.

**Não há resposta automática.** Nenhum caminho do código responde ao lead sem um
clique humano. O webhook apenas grava.

## Escopo

Dentro:

- Conectar/desconectar o número da academia por QR Code (instância Evolution criada sozinha).
- Ingestão de mensagens recebidas (e das enviadas pelo celular) em histórico persistido.
- Criação/vinculação automática de `Person` (lead, origem `whatsapp`) por conversa.
- Inbox na Captação: lista de conversas → histórico → responder texto.
- Registro de atendimento: quem atendeu, classificação de interesse, observação.

Fora (v1, documentado como não-objetivo):

- Qualquer automação/IA de resposta.
- Envio e download de mídia (imagem/áudio/documento). Mensagens de mídia recebidas
  entram no histórico como marcador (`📷 Imagem`, `🎤 Áudio`), sem baixar o binário.
- Grupos, listas de transmissão e status.
- Múltiplos números simultâneos (o modelo suporta, a UI expõe um).

## Arquitetura

Três serviços no projeto Railway existente, além do Postgres já em produção:

```
┌─────────────┐  interno   ┌───────────────┐   Baileys    ┌──────────┐
│  coliseu    │──────────▶ │ evolution-api │ ◀──────────▶ │ WhatsApp │
│  (Next.js)  │  HTTP      │   v2.3.7      │              └──────────┘
└─────────────┘            └───────────────┘
      ▲                        │      │
      │ webhook HTTPS público  │      │ cache de sessão
      └────────────────────────┘      ▼
                              ┌───────────────┐
   ambos ──▶ Postgres         │     redis     │
   (schemas separados)        └───────────────┘
```

- **evolution-api**: imagem `evoapicloud/evolution-api:v2.3.7`, volume em
  `/evolution/instances`. Nunca exposta publicamente — só rede interna Railway.
- **redis**: cache de sessão do Baileys (`CACHE_REDIS_ENABLED=true`). É o que
  segura reconexão estável sem repareamento. **O Next não usa Redis** — sem fila,
  sem client novo no app. A ingestão é síncrona e idempotente.
- **Postgres**: a Evolution usa o mesmo banco em `?schema=evolution`; o Prisma do
  Coliseu continua em `?schema=public`. Não colidem, e evita um 4º serviço.

Direções de tráfego:

- Coliseu → Evolution: `http://evolution-api.railway.internal:8080`, header `apikey`.
- Evolution → Coliseu: `POST https://<app>/api/webhooks/whatsapp`, header
  `x-webhook-secret`. Eventos assinados: `MESSAGES_UPSERT`, `CONNECTION_UPDATE`,
  `QRCODE_UPDATED`.

## Dados (Prisma, schema `public`)

```prisma
enum WhatsappStatus       { DISCONNECTED CONNECTING CONNECTED }
enum ConversaInteresse    { nao_classificado com_interesse sem_interesse perdido convertido }
enum MensagemDirecao      { IN OUT }
enum MensagemAutor        { LEAD ATENDENTE }

WhatsappInstance  id, unitId, evolutionInstance @unique, nome, status,
                  numeroConectado?, ultimoEstadoEm?, criadoEm

Conversa          id, unitId, instanceId, remoteJid, telefone, pushName?,
                  personId?, atendenteId?, interesse, naoLidas,
                  ultimaMensagemEm, ultimaMensagemPreview, criadoEm
                  @@unique([instanceId, remoteJid])

Mensagem          id, conversaId, waMessageId @unique, direcao, autor,
                  autorUserId?, texto, tipoMidia, enviadaEm, erro?
                  @@index([conversaId, enviadaEm])

AtendimentoRegistro  id, conversaId, userId, interesse, observacao?, criadoEm
                     @@index([conversaId, criadoEm])
```

`AtendimentoRegistro` é o "cadastro de atendimento": log append-only de quem
classificou o quê e quando. `Conversa.interesse` é só o estado corrente
(desnormalizado para a lista não precisar de subquery).

### Lead: criar ou vincular

Mensagem de número desconhecido → procura `Person` por telefone normalizado
(dígitos, comparando os **últimos 8 dígitos** para absorver o 9º dígito e o DDI).

- Achou (lead ou aluno) → vincula `Conversa.personId`, não duplica cadastro.
- Não achou → cria `Person` com `fase=lead`, `origem=whatsapp`, `estagio=novo`,
  `nome = pushName ?? telefone formatado`, `telefone`.

Assim o lead aparece na aba Leads da Captação no mesmo instante em que a conversa
aparece na aba Atendimento.

### Interesse → estágio do funil

O select do atendimento escreve nos dois campos. Mapa fixo:

| Select                | `Conversa.interesse` | `Person.estagio`               |
| --------------------- | -------------------- | ------------------------------ |
| Não classificado      | `nao_classificado`   | (não mexe)                     |
| Com interesse         | `com_interesse`      | `interesse`                    |
| Sem interesse         | `sem_interesse`      | `qualificado`                  |
| Perdido               | `perdido`            | `perdido` + `motivoPerdido`    |
| Convertido            | `convertido`         | `convertido`                   |

"Sem interesse" cai em `qualificado` de propósito: a pessoa conversou e foi
qualificada, mas não quer agora — é exatamente a lista de reativação que o
subtítulo da página já promete. `perdido` é o descarte definitivo, com motivo.

## Fluxos

### Conectar

1. Recepção (ADMIN) clica **Conectar WhatsApp** na Captação.
2. `POST /api/whatsapp/instancia` → cria a instância na Evolution
   (`instance/create`, `integration: WHATSAPP-BAILEYS`, `qrcode: true`, webhook já
   no payload), grava `WhatsappInstance` com status `CONNECTING`. Se a instância
   já existe na Evolution (403/409 com "already in use"), reaproveita e só
   reaplica o webhook — operação idempotente.
3. Modal abre e chama `GET /api/whatsapp/instancia/qrcode` → `instance/connect`,
   devolve `{ base64, pairingCode }` ou `{ connected: true }`.
4. Modal refaz o QR a cada 20s e checa `connectionState` a cada 3s. Ao ver
   `open`, grava `CONNECTED` + número, fecha e dá `router.refresh()`.

Falha da Evolution (rede/502) devolve 502 com mensagem legível; o modal mostra e
oferece "Tentar de novo". Nada fica meio-criado: a linha só vira `CONNECTED`
quando o `connectionState` confirma.

### Receber

`POST /api/webhooks/whatsapp`:

1. Confere `x-webhook-secret`. Em produção sem secret configurado → 503
   (mesmo padrão do webhook Asaas).
2. Responde `200` imediatamente; processa em seguida. Erro no processamento é
   logado, nunca vira retry infinito da Evolution.
3. `event !== "messages.upsert"` → trata só `connection.update` (atualiza status
   da instância) e ignora o resto.
4. Descarta `@g.us`, `@broadcast`, `status@broadcast`.
5. Extrai texto (`conversation`, `extendedTextMessage.text`, `*.caption`) e
   `tipoMidia`. Sem texto e sem mídia → ignora.
6. Upsert de `Conversa` (por `instanceId + remoteJid`), resolve/cria `Person`.
7. Grava `Mensagem`. `waMessageId` é `@unique`: reentrega da Evolution não
   duplica (`P2002` → no-op). Mesma garantia de idempotência do `WebhookEvent`.
8. `fromMe: true` → grava como `OUT` / `ATENDENTE` sem `autorUserId` (resposta
   dada pelo celular, aparece no histórico como "pelo aparelho"). `fromMe: false`
   → `IN` / `LEAD` e incrementa `naoLidas`.

**Nenhum ramo deste fluxo envia mensagem.** Há teste garantindo isso.

### Responder

`POST /api/whatsapp/conversas/[id]/mensagens { texto }` (ADMIN ou RECEPCAO):
valida instância conectada → `message/sendText` → grava `Mensagem` OUT com o
`key.id` retornado e `autorUserId = usuário da sessão`. Se a conversa ainda não
tem `atendenteId`, assume o usuário atual. Quando o mesmo id voltar pelo webhook
(`fromMe`), o `@unique` deduplica.

Falha de envio grava a mensagem com `erro` preenchido e devolve 502 — a
recepção vê a bolha marcada como não entregue em vez de perder o texto.

### Classificar

`PATCH /api/whatsapp/conversas/[id] { interesse, observacao?, motivoPerdido? }`:
atualiza `Conversa.interesse`, aplica o mapa no `Person.estagio` e insere
`AtendimentoRegistro` com o usuário da sessão.

## UI

Duas rotas irmãs com abas no topo:

- `/captacao` — funil de leads (tela atual, inalterada abaixo do cabeçalho).
- `/captacao/atendimento` — inbox: lista à esquerda, conversa à direita
  (`?c=<conversaId>`).

No cabeçalho da Captação, o botão primário passa a ser **Conectar WhatsApp**
(quando conectado, vira o chip `● WhatsApp conectado · <número>` com menu para
desconectar). O **+ Novo cadastro** continua, como botão secundário ao lado —
removê-lo quebraria o cadastro de balcão/indicação, que não passa por WhatsApp.

Painel da conversa: cabeçalho com nome/telefone/link para o cadastro do lead,
histórico em bolhas (IN à esquerda, OUT à direita, marcador de mídia e de erro),
e rodapé com composer de texto, `select` de interesse e campo de observação.

Realtime por polling — sem SSE, sem WebSocket: lista a cada 5s, thread aberta a
cada 3s (`?depois=<isoDate>`, devolve só o delta). É o suficiente para uma
recepção e não adiciona infra.

## Segurança

- `EVOLUTION_API_KEY` e `WHATSAPP_WEBHOOK_SECRET` só no servidor; nunca em props
  de client component nem em `NEXT_PUBLIC_*`.
- Conectar/desconectar instância: **ADMIN**. Ler/responder/classificar: ADMIN +
  RECEPCAO. TECNICO não acessa.
- Evolution sem porta pública no Railway.
- Log de telefone sempre redigido (últimos 4 dígitos).

## Testes (vitest)

Unitários, puros, sem rede (`payload.test.ts`, `telefone.test.ts`):

- extração de texto/tipoMidia dos formatos Baileys (conversation, extendedText,
  imageMessage+caption, audioMessage, botão, vazio, `remoteJidAlt` sobre `@lid`).
- normalização de telefone e match por últimos 8 dígitos (com/sem 9º dígito, DDI).
- filtro de grupo/broadcast/status; redação de telefone em log.

Integração (Postgres de dev, como os testes existentes — `ingest.test.ts`):

- ingestão cria conversa + `Person` lead + mensagem, e conta não lidas.
- segunda entrega do mesmo `waMessageId` não duplica.
- número já cadastrado (inclusive formatado, sem DDI) vincula em vez de duplicar.
- `fromMe` entra como saída sem autor de sistema e zera não lidas.
- grupo ignorado; evento sem instância registrada não quebra.
- classificar grava `AtendimentoRegistro` e move o `estagio`; `perdido` guarda o motivo.

Garantia de "sem automação" (`sem-automacao.test.ts`): teste de **arquitetura**,
não de comportamento. Percorre o fecho transitivo dos imports a partir da
ingestão e do webhook e falha se algum deles alcançar `@/lib/whatsapp/evolution`
— o único módulo que envia. Inclui um controle negativo (a rota de resposta
manual *deve* alcançá-lo), para o teste não passar por engano.

## Variáveis de ambiente

```
EVOLUTION_URL=http://evolution-api.railway.internal:8080
EVOLUTION_API_KEY=          # mesma chave do serviço evolution-api
EVOLUTION_INSTANCE=coliseu  # nome técnico da instância
WHATSAPP_WEBHOOK_SECRET=    # header x-webhook-secret
PUBLIC_APP_URL=https://coliseu-production.up.railway.app
```

Sem `EVOLUTION_URL`/`EVOLUTION_API_KEY` o app roda normalmente: a Captação mostra
"WhatsApp não configurado" e as rotas devolvem 503, sem quebrar nada — mesmo
comportamento gracioso do Asaas em modo demonstração.

## Riscos

- **Ban de número**: envio manual, volume baixo, sem disparo em massa. Risco
  aceito; documentado no DEPLOY.md que o número deve ser da academia, não pessoal.
- **Sessão perdida**: se o volume `/evolution/instances` sumir, é repareamento
  por QR — 30 segundos de recepção. Aceito.
- **@lid**: WhatsApp pode entregar JID sem telefone. Nesse caso a conversa é
  gravada com `remoteJid` original e telefone vazio; o lead é criado sem telefone
  e a recepção completa no cadastro. Não bloqueia a ingestão.
