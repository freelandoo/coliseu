# Acesso Freelandoo a partir do Coliseu — design

Data: 2026-10-20 · Status: aprovado em conversa (grilling Q1–Q19 + arquitetura A), aguardando revisão do documento.

## Objetivo

Todo aluno da Academia Coliseu passa a ter conta no app Freelandoo (treinos e perfil) sem cadastro manual:

- quem já é aluno ganha a conta na **primeira passagem válida pela catraca**;
- quem se matricula ganha a conta **na matrícula**;
- o aluno recebe no **WhatsApp da academia** um link de primeiro acesso, cria a senha e aceita os termos num modal na Freelandoo;
- o Coliseu mostra quem está na Freelandoo (foto grande + barrinha da validade do treino) e os **treinos vencidos**.

Leads nunca ganham conta.

## Decisões (registro)

| # | Decisão |
|---|---|
| Q1 | Cinco fases, nesta ordem: (1) conta via API de parceiro + botão na ficha; (2) criação automática na matrícula e na catraca; (3) envio do acesso no WhatsApp; (4) listas com foto e barrinha; (5) treinos com validade 30/60/90 e vencidos no Coliseu. |
| Q2 | Só alunos. Antigos: na 1ª passagem válida. Novos: na matrícula. CPF já com conta na Freelandoo: só vincula (sem nova senha). |
| Q3 | Sem senha no texto: **link de primeiro acesso** válido por 7 dias; login = e-mail ou CPF. Reenvio por botão. |
| Q4 | Única exceção à regra "nada é enviado sozinho": a mensagem de boas-vindas, uma vez por aluno, num módulo isolado e travado por teste. O teste `sem-automacao` do Atendimento continua valendo. |
| Q5 | Sem e-mail, sem CPF válido ou sem data de nascimento: não cria. Aparece "falta dado"; completar o cadastro libera na próxima passagem. Nunca e-mail inventado. |
| Q6 | Validade **por treino** (30/60/90, padrão 60), escolhida em quem cria a ficha na Freelandoo. Coliseu só exibe. |
| Q7 | A foto vem do iDFace (hoje descartada), vai para a Freelandoo; o Coliseu guarda só a URL. |
| Q8 | Barrinha = validade do treino ativo (dias restantes; vermelha quando vencido). |
| Q9 | Mudanças também no `freelandoo-backend` e no frontend da Freelandoo, com commit/push no master deles; ligar `fitness_academias` para a academia Coliseu. |
| Q10 | Envio pelo número da academia (Evolution do Coliseu). |
| Q11 | Envio logo após a passagem. Sem telefone válido: conta criada, ficha mostra "acesso não enviado" + botão. |
| Q12 | Fila no banco do Coliseu com retentativa (1/min, até 10), depois falha visível com "Tentar de novo". A catraca nunca espera. |
| Q13 | Coliseu puxa da Freelandoo em lote (foto, situação, treino) a cada 10 min e ao abrir a ficha; guarda cópia local. |
| Q14 | Chave de parceiro gerada pela Freelandoo em `/academias`, colocada como variável de ambiente no Railway do Coliseu (`FREELANDOO_PARTNER_KEY`, `FREELANDOO_API_URL`). |
| Q15 | Linha rica em Matriculados; filtros Na Freelandoo / Sem conta / Falta dado / Treino vencido; seção "Freelandoo" na ficha. Captação igual. |
| Q16 | Sem criação em massa. Antigos só pela catraca ou botão na ficha (protege o número de bloqueio). |
| Q17 | Menor de 18: não cria; ficha mostra "menor de idade — conta pelo responsável" (fase futura). |
| Q18 | Treinos existentes ficam com 90 dias; novos nascem com 60. |
| Q19 | Consentimento na Freelandoo: endereço dedicado da academia + **modal de termos no primeiro login** (aceite de termos/privacidade/vínculo e, opcional, uso da foto da academia como foto de perfil). Até aceitar: conta "aguardando aceite", sem foto, invisível no resto da plataforma. Recusa apaga a conta. Aceite registrado com versão dos termos e data. |
| Arq. | (A) Coliseu chama a Freelandoo, com fila no Coliseu. |

## Arquitetura

```
 iDFace ──evento──► access-agent ──► Coliseu: ingestarEvento ──┐
 Matrícula (PATCH matricular) ─────────────────────────────────┤ enfileira (não espera)
 Ficha: botões criar/reenviar ─────────────────────────────────┘
                                                                ▼
                                          TarefaFreelandoo (fila no Postgres do Coliseu)
                                                                │ agendador, 1/min
                       ┌────────────────────────────────────────┼──────────────────────────┐
                       ▼                                        ▼                          ▼
           POST /partner/v1/members            PUT …/foto-academia          lib/freelandoo/boas-vindas
           (criar ou vincular por CPF)          (foto do iDFace)            → Evolution (número da academia)
                       │
                       ▼
      Freelandoo: conta "aguardando aceite" + link de 1º acesso
                       │  aluno toca no link
                       ▼
      /academia/coliseu/primeiro-acesso → cria senha → modal de termos → conta ativa

 Coliseu ◄── GET /partner/v1/members (lote, 10 min + ao abrir a ficha) ── foto, situação, treino, vencimento
```

A integração antiga (Freelandoo → Coliseu: `member`, `access-events`, `payments`) continua como está.

## Freelandoo — mudanças

### API de parceiro (`/partner/v1`)

Autenticação: `Authorization: Bearer <chave de parceiro>`. A chave é gerada pelo dono da academia em `/academias` (mostrada uma vez), guardada como hash SHA-256 numa coluna nova de `tb_academy` e comparada em tempo constante. Escopo: só a academia dona da chave.

| Rota | Faz | Resposta |
|---|---|---|
| `POST /partner/v1/members` | Corpo `{cpf, nome, email, data_nascimento, telefone, ref_externa}`. CPF já com conta → só vincula (`tb_academy_member`). Senão cria `tb_user` com `senha NULL`, `ativo=false`, estado `aguardando_aceite`, username gerado (`nome.sobrenome` + número se preciso), e o vínculo. Idempotente por CPF. | `{id_user, status: "criado"\|"vinculado", link_primeiro_acesso?}` (link só quando criado) |
| `POST /partner/v1/members/:id_user/link` | Novo link de 1º acesso (invalida o anterior). Só para conta ainda aguardando aceite. | `{link_primeiro_acesso, expira_em}` |
| `PUT /partner/v1/members/:id_user/foto-academia` | Multipart; guarda em R2 `academy-photos/{id_academy}/{id_user}-{uuid}.jpg`, separada do avatar. | `{ok:true}` |
| `GET /partner/v1/members?since=` | Lote dos vínculos da academia: `{id_user, cpf, estado, avatar_url, treino:{nome, criado_em, validade_dias, vence_em}\|null}`. | lista paginada |

Erros com código estável: `cpf_invalido`, `email_em_uso` (e-mail em outra conta com CPF diferente), `menor_de_idade`, `dados_incompletos`, `chave_invalida`. O Coliseu decide o que mostrar por esse código.

Regras que a API aplica (não confia no Coliseu): CPF com dígito verificador; idade ≥ 18 pela data de nascimento; e-mail único.

### Primeiro acesso e consentimento

- Token de 1º acesso em tabela própria (`tb_user_first_access`: hash, `expira_em` = +7 dias, `usado_em`), mesmo padrão do `tb_user_activation`.
- Página do frontend `/academia/[slug]/primeiro-acesso?token=` com a marca da academia: cria a senha (mesma regra de força do cadastro) e já entra.
- **Modal no primeiro login** de conta vinda de academia: termos de uso, privacidade e vínculo com a academia (obrigatório) + "usar a foto do cadastro da academia como foto de perfil" (opcional). Grava em `tb_user_consent` (`id_user`, `versao_termos`, `aceito_em`, `foto_academia_aceita`).
- Aceitou: estado `ativo`; se aceitou a foto, copia a `foto-academia` para avatar (`ProfileStorage.setAvatar`). Recusou: apaga a conta e o vínculo.
- Conta `aguardando_aceite` não aparece em busca, ranking nem perfis públicos.

### Treinos

- Migração: `tb_workout_plan.validade_dias SMALLINT NOT NULL DEFAULT 60 CHECK (validade_dias IN (30,60,90))`; `UPDATE … SET validade_dias = 90` para os planos existentes.
- `WorkoutStorage.expiredPlans` passa a usar `created_at + validade_dias`; `PLAN_EXPIRY_DAYS` sai.
- Formulário de treino (aluno e proposta do professor): seletor 30 / 60 / 90, padrão 60.

### Ativação

Ligar `fitness_academias` para a academia Coliseu (a flag hoje nasce desligada).

## Coliseu — mudanças

### Dados (Prisma)

`Person` ganha:

| Campo | Tipo | Para |
|---|---|---|
| `freelandooUserId` | `String? @unique` | vínculo |
| `freelandooEstado` | enum `FreelandooEstado` | `sem_conta`, `falta_dado`, `menor`, `aguardando_aceite`, `ativa`, `conflito_email`, `falhou` |
| `freelandooFotoUrl` | `String?` | linha rica |
| `freelandooTreinoNome` / `freelandooTreinoVenceEm` / `freelandooTreinoValidadeDias` | `String?` / `DateTime?` / `Int?` | barrinha e filtro de vencidos |
| `freelandooSincronizadoEm` | `DateTime?` | frescor |
| `freelandooAcessoEnviadoEm` | `DateTime?` | "acesso não enviado" |

`TarefaFreelandoo`: `id`, `personId`, `tipo` (`CRIAR_ACESSO`, `ENVIAR_FOTO`, `ENVIAR_BOAS_VINDAS`, `REENVIAR_LINK`), `status` (`PENDENTE`, `EM_ANDAMENTO`, `OK`, `FALHOU`), `tentativas`, `proximaEm`, `ultimoErro`, `dedupeKey @unique` (ex.: `criar:<personId>`), `criadoEm`, `concluidoEm`. Mesmo padrão de `DeviceCommand`.

### Elegibilidade (função pura, `lib/freelandoo/elegibilidade.ts`)

Entrada: pessoa + matrícula atual. Saída: `elegivel` ou motivo (`nao_e_aluno`, `matricula_invalida`, `falta_cpf`, `cpf_invalido`, `falta_email`, `falta_nascimento`, `menor`, `ja_vinculado`). Usa o `cpfValido` (hoje em `lib/migracao/limpeza.ts`, sobe para `lib/cpf.ts`). Matrícula válida = mesma regra da política de acesso (`evaluateAccessEligibility`).

### Gatilhos (só enfileiram)

1. **Catraca:** em `ingestarEvento`, no bloco que já roda só para evento novo `ALLOWED + passou + ENTRY` (`lib/agent/ingest.ts`), se `freelandooEstado ∈ {sem_conta, falta_dado}` → reavalia elegibilidade; elegível → enfileira `CRIAR_ACESSO`; senão atualiza o estado para o motivo. Nunca chama rede.
2. **Matrícula:** depois de `matricularPessoa` no PATCH `acao:"matricular"`, mesma lógica.
3. **Ficha:** botões "Criar acesso", "Reenviar acesso", "Tentar de novo" (POST em `/api/pessoas/[id]/freelandoo`, ADMIN e recepção).
4. **Cadastro de face:** no ack de `ENROLL`, se vier `user_image`, enfileira `ENVIAR_FOTO` (guarda a imagem só até o envio, na própria tarefa; apagada ao concluir).

### Processamento (agendador, a cada minuto)

`lib/freelandoo/fila.ts`: pega tarefas `PENDENTE` com `proximaEm ≤ agora` (lote de 20), marca `EM_ANDAMENTO`, executa, conclui. Falha: `tentativas+1`, `proximaEm = agora + 1 min`; na 10ª vira `FALHOU`, pessoa `freelandooEstado = falhou`, notificação no sino (padrão `Notificacao`). Chave de parceiro inválida (401/403) para a fila inteira e mostra aviso no painel do admin.

- `CRIAR_ACESSO` → `POST /partner/v1/members` → grava `freelandooUserId` e estado; se `criado` → enfileira `ENVIAR_BOAS_VINDAS` (e `ENVIAR_FOTO` se já houver foto pendente). `vinculado` → estado `ativa`, sem mensagem. `email_em_uso` → `conflito_email`, sem retentativa.
- `ENVIAR_BOAS_VINDAS` / `REENVIAR_LINK` → (reenvio pede link novo) → `lib/freelandoo/boas-vindas.ts`.

### Envio automático isolado

- `lib/freelandoo/boas-vindas.ts` é o **único** módulo fora de rotas de sessão autorizado a importar o envio do WhatsApp. Envia por número (o `contextoEnvio` atual exige `Conversa`; o módulo cria/acha a conversa do aluno pelo telefone e grava a mensagem como OUT, autor "sistema").
- Texto: "Olá, {primeiro nome}! Seu acesso ao app de treinos da Academia Coliseu está pronto. Toque para criar sua senha: {link} (vale por 7 dias)."
- Novo teste de arquitetura `lib/freelandoo/envio-automatico.test.ts`: o fecho de imports de todo módulo não-rota só alcança `@/lib/whatsapp/evolution` através de `lib/freelandoo/boas-vindas.ts`. O `sem-automacao.test.ts` continua igual (ingestão do WhatsApp não alcança envio). Comentário do teste antigo atualizado citando esta decisão.
- Telefone ausente/inválido: não envia; `freelandooAcessoEnviadoEm` fica nulo → ficha mostra "acesso não enviado".

### Sincronização (agendador, a cada 10 min + ao abrir a ficha)

`GET /partner/v1/members?since=` → atualiza foto, estado (`aguardando_aceite` → `ativa`, conta apagada → `sem_conta`), treino e vencimento, `freelandooSincronizadoEm`. Falha de rede: mantém a cópia e loga.

### Telas

- **Matriculados (`ClientesView`)**: linha rica quando `freelandooEstado = ativa` — foto grande (48px, cantos do tabloide), nome, barrinha da validade do treino (proporção dias restantes / validade; vermelha vencido; "sem treino" quando nulo). `aguardando_aceite` = selo. Demais: linha atual. Filtros: Na Freelandoo, Sem conta, Falta dado, Treino vencido.
- **Ficha (`FichaCliente`)**: seção "Freelandoo" — estado, motivo quando não elegível, tentativas/erro, botões, treino ativo com validade.
- **Captação**: sem mudança.

### Configuração

Env no Railway do Coliseu: `FREELANDOO_API_URL`, `FREELANDOO_PARTNER_KEY`. Sem a chave, a fila não processa e a ficha mostra "integração não configurada".

## Dependência externa

A criação via catraca depende de os eventos do iDFace voltarem a chegar (parados desde 24/07, pendência do corte CloudGym). Fases 1, 4 e 5 independem. A fase 2 é testável pelo simulador (`lib/access/simulate.ts`).

## Testes

Coliseu (Vitest): elegibilidade (todos os motivos); fila (retentativa, limite, dedupe, parada por chave inválida, sem chamada de rede na ingestão); gatilho da catraca via simulador; mapeamento dos códigos de erro da API; arquitetura do envio automático; barrinha (cálculo de dias restantes).

Freelandoo: API de parceiro (criar, vincular, idempotência, `email_em_uso`, `menor_de_idade`, `cpf_invalido`, chave inválida/de outra academia); primeiro acesso (token expirado/usado); aceite e recusa (apaga conta); validade dos treinos e migração dos existentes para 90.

## Fora de escopo

Conta de menor via responsável; criação em massa; WhatsApp oficial (Meta) para o Coliseu; edição de treino pelo Coliseu; outras academias além da Coliseu (o modelo já é por academia, mas só a Coliseu é ligada).
