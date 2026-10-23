# Melhorias nas páginas do Coliseu (out/2026)

Plano fechado com o Alex em 2026-10-22 (sessão de "grill"). Objetivo: as quatro
frentes juntas — uso da recepção, visual consistente, velocidade e organização
do código — resolvidas **por área**.

## Regras combinadas

- Desktop primeiro (balcão), sem quebrar no celular.
- Coliseu 3D e malha de fundo **intocados** (decisão anterior mantida).
- Padrão visual = o Coliseu futurista atual, aplicado de forma consistente; piso
  de acessibilidade (teclado, foco visível, contraste).
- Menu pode ser reagrupado/reordenado; nomes e endereços ficam (rota que mudar
  redireciona a antiga).
- Textos de interface podem ser reescritos; mensagens para alunos só com aprovação.
- Sem mudar regra de negócio; mexer em API só para carregar menos dado.
- Gráficos próprios (SVG, sem biblioteca), seguindo a skill de dataviz.
- Animação de entrada (`Reveal`, GSAP) vira CSS com o mesmo efeito.
- Cada etapa: build + testes + teste do fluxo + medição antes/depois aqui +
  commit/push no master + pausa para revisão.

## Etapas

| # | Etapa | Escopo |
|---|---|---|
| 0 | Urgente | guards de papel em telas/APIs de pessoas; data real; série real em Relatórios |
| 1 | Fundação | error/not-found/loading, cabeçalho único, menu, login sem "Cadastrar", Reveal em CSS, Playwright |
| 2 | Alunos | lista, ficha, matrícula, renovação; carregar só o necessário |
| 3 | Atendimento | quebrar `ConversaPainel` (1173 l.) e `AtendimentoInbox` (800 l.) |
| 4 | Captação e aula experimental | consultas com recorte de data/fase |
| 5 | Painel e Relatórios | infográficos |
| 6 | Cobrança e Despesas | estados vazios, consultas enxutas |
| 7 | Acesso, Perfil e Backup | acabamento |

## Etapa 0 — feita em 2026-10-22

**Permissões.**
- `/captacao` e toda a área `/matriculados/*` não checavam papel: o TECNICO abria
  lista de alunos, ficha, matrícula, retenção e fidelidade digitando o endereço.
  Agora: `requireModulo("captacao")` na página e `matriculados/layout.tsx` com
  `requireModulo("matriculados")`.
- APIs que só exigiam sessão: `/api/pessoas` (GET lista tudo, POST cria),
  `/api/pessoas/[id]` (GET/PATCH/DELETE e matrícula), `/api/pessoas/[id]/checkout`,
  `/api/acesso/simular`. Agora usam `exigirModuloApi(...)` (novo, em `api-guard.ts`).
- `src/app/paginas-protegidas.test.ts` falha se uma página de `(app)` nascer sem
  guard (provado: sem as correções ele lista as 7 telas abertas).

**Data real.** `HOJE` fixo em 2026-06-28 (`mock-data.ts`) contava todos os "dias
desde" a partir de junho. Todo cálculo roda no servidor, então `diasEntre` passou a
usar `new Date()` sem risco de hidratação. Efeito: dias de atraso, ausência e tempo
de casa em Cobrança, Retenção, Fidelidade e Relatórios ficaram ~4 meses maiores —
agora corretos. O aviso "data de referência fixa" saiu de `LimitacaoIndicadores`.

**Série real em Relatórios.** `serieMensal()` era inventada. `serieMensalRepo()`
agrega no banco (fuso da academia), últimos 6 meses:
- matrículas = `Membership.matriculadoEm` no mês;
- recebido = soma de `Payment.value` PAID por `paidAt` (caixa);
- "vencidas sem renovar" = `Membership` EXPIRED pelo mês do vencimento (não há
  data de cancelamento na base).
O mês corrente vem `parcial` e o destaque mostra o último mês fechado.
Produção em 22/10: set = 63 matrículas / R$ 87.651 / 34 vencidas; out (parcial) =
4 / R$ 2.226 / 1 — a academia ainda opera pelo CloudGym.

## Etapa 1 — Fundação (2026-10-22)

- `(app)/error.tsx` (a tela cai, o menu fica; "Tentar de novo" + código do erro),
  `(app)/loading.tsx` (esqueleto parado, sem shimmer) e `app/not-found.tsx`.
- `PageHeader` é o cabeçalho único das telas de trabalho, com slot `acoes`. Saíram
  os números `step` (havia dois "5" e nenhum 2/4). Perfil usa o padrão. Títulos
  alinhados ao menu (Cobrança, Despesas, Relatórios, Controle de acesso, Minha conta).
  Painel mantém a saudação (tela de abertura, de propósito).
- Menu: "Dia a dia" (Painel, Atendimento, Alunos, Captação, Aula experimental),
  "Gestão" (Cobrança, Despesas, Relatórios), "Operação", "Conta". URLs iguais.
- Login: "Cadastrar" só enquanto não há usuário (a API já recusava com 403).
- `Reveal` virou CSS (`.revela`: 16px/400ms/power3.out), componente de servidor.
- Playwright 1.63.0 (`npm run e2e`, `e2e/`): login, todas as telas do admin,
  técnico e recepção barrados onde devem, 404, celular sem rolagem lateral e gaveta
  do menu. `e2e/medir.mjs` mede JS e tempo por tela.

**Medição** (build de produção local, admin logado, JS descompactado por tela):

| Tela | antes | depois |
|---|---|---|
| /atendimento | 1580 KB | 1516 KB |
| /matriculados | 1512 KB | 1448 KB |
| /matriculados/renovar | 1497 KB | 1433 KB |
| /captacao | 1506 KB | 1443 KB |
| /cobranca | 1491 KB | 1427 KB |
| /acesso | 1483 KB | 1419 KB |
| /painel, /aula-experimental, /relatorios | ~1470–1490 KB | igual (ainda usam GSAP em outros componentes) |

844 KB de cada tela é o three.js da malha de fundo/Coliseu 3D — fora do escopo por
decisão (Q4). Tempo até a tela pronta local ~100–170 ms antes e depois (ruído).

## Etapa 2 — Alunos (2026-10-22)

Produção em 22/10: 944 alunos, 1.379 leads, 12.970 ex-alunos, 946 matrículas,
8 cobranças.

- `listarPessoasRepo(fases?)` recorta a fase **no banco** (ex-aluno continua
  sempre de fora). Lista de alunos, Retenção, Fidelidade, Cobrança e o MRR de
  Despesas leem só `aluno`; Captação lê só `lead`. Antes todas traziam leads +
  alunos e filtravam em memória.
- Renovação: uma leitura de leads + alunos alimenta os candidatos e a lista
  "Aguardando pagamento" (antes eram duas leituras completas), e das cobranças
  vêm só as pendentes. `candidatosMatricula(pessoas?)` aceita o que a tela já leu.
- Código do cadastro novo (`proximoCodigoRepo`) é o maior número calculado em SQL,
  sem ler os 15.293 códigos.
- `alunoPorId` de `store.ts` (sem uso, lia a base inteira) saiu; `paraAluno`
  ficou exportado.
- Ficha: já lia uma pessoa só; sem mudança.
- Testes: `pessoas.test.ts` cobre o recorte; `e2e/alunos.spec.ts` (lista sem
  leads, ficha a partir da lista, renovação com lead, aluno a renovar e pendente).

**Medição** (consultas contra o banco de produção, a partir da máquina local, com
~200 ms de latência por ida e volta — dentro do Railway o ganho relativo é maior):

| Consulta | antes | depois |
|---|---|---|
| Lista de alunos | 2.323 linhas, 2,3 MB, 969 ms | 944 linhas, 1,2 MB, 656 ms |
| Renovação | 2 × 2.323 linhas + todas as cobranças | 1 × 2.323 linhas + pendentes |
| Código do cadastro novo | 15.293 linhas, ~280 ms | 1 linha, ~215 ms (≈ latência pura) |

O JS por tela não muda nesta etapa (o que pesa é o three.js da moldura, fora de
escopo).

## Etapa 3 — Atendimento (2026-10-22)

Organização, sem mudar o que a tela faz. Os dois componentes gigantes viraram
orquestradores pequenos; cada peça tem um arquivo e um trabalho:

| Arquivo | antes | depois |
|---|---|---|
| `ConversaPainel.tsx` | 1173 l. | 500 l. (rascunho, envio, apagar, classificar) |
| `AtendimentoInbox.tsx` | 800 l. | 409 l. (seleção, abas, ficha, celular) |

- `captacao/conversa/`: `useHistorico` (abrir pelo fim, anteriores, novidades
  por SSE + rede de segurança, rolagem e aviso de "mensagens novas"), `Bolha`
  (mídia, citação, arrastar para citar), `BarraAcoes` (bandeiras, gavetas,
  limpar/remover), `CaixaResposta` (convite, citação, anexo, áudio, texto) e
  `ConfirmarExclusao`.
- `captacao/inbox/`: `useListaConversas` (paginação, tempo real, ordem congelada
  sob o ponteiro, nome de grupo), `useBuscaServidor`, `FiltrosLista` (abas,
  bandeiras, campo de busca), `ListaConversas`, `CabecalhoConversa`.
- `captacao/icones.tsx`: os SVGs que se repetiam em linha.
- Teste: `e2e/atendimento.spec.ts` semeia uma instância própria com 3 conversas
  (pessoa ligada a cadastro, lead com interesse, grupo) e apaga no fim. Cobre
  abas Pessoas/Grupos, abrir histórico, citar + Esc, rascunho guardado ao trocar
  de conversa, busca por palavra do histórico, filtro por bandeira, ficha ao
  lado, confirmação de limpar (admin) e recepção sem limpar/remover.

**Medição:** `/atendimento` 1516 KB → 1518 KB de JS (igual; a meta era
organização). Tempo até a tela pronta local ~480 ms com 3 conversas.

## Etapa 4 — Captação e aula experimental (2026-10-22)

Produção em 22/10: 1.379 leads (1.374 "novo", 5 "com interesse"), 1.769
conversas (1.754 ligadas a cadastro), 19 aulas experimentais.

- **Lista de leads em lotes de 50** ("Mostrar mais 50"). Antes a Captação
  desenhava os 1.379 leads duas vezes (cartões do celular + tabela do desktop),
  cada linha com o atalho de matrícula: ~2.760 linhas na tela. Agora 100
  (50 + 50). Contagem por estágio e busca continuam olhando a base inteira;
  mudar filtro ou busca volta ao primeiro lote. Ordem: o mais novo primeiro.
- **Aviso "aulas hoje"** lê só o dia (`listarAulasExperimentaisEntre(hoje, hoje)`),
  não a agenda inteira.
- **Mapa lead → conversa** (`mapaConversaPorPessoaRepo(["lead"])`) lê só as
  conversas de leads, não as de alunos e ex-alunos.
- **Busca de leads**: termo com letra não vira busca por telefone. "Lote 119"
  casava com quase todo celular "(11) 9…" porque os dígitos 119 apareciam no
  número.
- `/aula-experimental` continua lendo a agenda inteira: o filtro "Todas" é o
  histórico, e são 19 linhas (2 KB).
- Teste: `e2e/captacao.spec.ts` (120 leads de teste: 50 por vez, "Mostrar mais",
  busca fora do lote, limpar volta ao lote, contagem do estágio na base toda).

**Medição** (consultas contra o banco de produção, da máquina local):

| Consulta / tela | antes | depois |
|---|---|---|
| Linhas de lead desenhadas na Captação | ~2.760 | 100 |
| Mapa lead → conversa | 1.754 linhas, 130 KB, 289 ms | 1.379 linhas, 102 KB, 245 ms |
| Aulas para o aviso do dia | 19 linhas | só as de hoje |

## Etapa 5 — Painel e Relatórios (2026-10-23)

**Relatórios redesenhados como infográficos** (SVG/HTML próprios, regras da
skill de dataviz, paleta validada com o `validate_palette.js`):
- **Um eixo por gráfico.** "Evolução da receita" punha reais e matrículas
  vencidas no mesmo gráfico com duas escalas — o alinhamento inventava uma
  correlação. Agora: "Recebido por mês" (linha 2px, véu de 10%, mês corrente
  tracejado e marcado com *) e "Matrículas por mês" (novas × vencidas sem
  renovar, colunas lado a lado, mesma unidade, legenda).
- **Barras de uma cor só, com destaque.** As barras eram pintadas por estado
  (verde/âmbar/vermelho), mas no papel âmbar e vermelho ficam a ΔE 0,9 para
  deuteranopia (validador: FAIL). Agora cada gráfico tem a cor da marca e só a
  barra que conta a história fica nela (Atrasado, 21+ dias, Convertido, pico de
  evasão — empate no pico destaca todas); o rótulo diz o estado. Barra de 18px,
  ponta arredondada, valor fora da barra em tinta (nunca cortado).
- **Resultado do mês vira conta** (receita − despesas = lucro) com a fração da
  receita que as despesas comem; antes eram três barras do zero, que não
  mostravam prejuízo.
- **Tooltip** no hover e pelas setas do teclado (o gráfico recebe foco), com
  todas as séries do mês; **"Ver em tabela"** em todo cartão. SVG medido em
  pixels (ResizeObserver): o texto do eixo não encolhe no celular.
- Animação de entrada em CSS (`.barra-cresce`, `.coluna-cresce`, `.traca`);
  `prefers-reduced-motion` zera tudo.
- **GSAP saiu do projeto**: Relatórios era o último uso. `gsap` e `@gsap/react`
  desinstalados; `concluirSeReduzido` (sem uso) e o teste dele removidos.
- **Dados:** leads e cobranças entram só como contagem no banco
  (`contarLeadsPorEstagioRepo`, `contarCobrancasPorStatusRepo`).
- Painel: sem mudança — já era CSS puro e só faz contagens; os números dele
  continuam como estão (tela de abertura, decisão anterior).
- Teste: `e2e/relatorios.spec.ts` (sem rolagem lateral, tooltip pelo teclado nos
  dois gráficos do tempo, tabela com os 6 meses).

**Medição:**

| | antes | depois |
|---|---|---|
| JS de /relatorios | ~1.480 KB | 1.414 KB |
| Leads lidos por Relatórios (produção) | 1.379 linhas com matrículas, 1,1 MB, 614 ms (+ mapa de conversas) | 2 linhas, 87 B, 185 ms |
| Cobranças lidas por Relatórios | todas as linhas | 1 contagem por status |

## Etapa 6 — Cobrança e Despesas (2026-10-23)

- **Cobrança lê só o que está em aberto** (`listarCobrancas(["pendente",
  "atrasado"])`); pagas, canceladas e estornadas não aparecem na tela e não
  precisam viajar. Produção hoje tem 8 cobranças (Asaas em mock), mas a tabela
  cresce um registro por mensalidade.
- **Estado vazio que explica**: cada filtro diz o que apareceria ali ("Mensalidade
  vencida sem pagamento aparece aqui, da mais antiga para a mais nova"), em vez
  de "Nada nesta categoria." — lista vazia não parece falha de carregamento.
- O nome na lista leva à ficha do aluno; "Cobrar" sem telefone mostra "sem
  telefone" em vez de um `wa.me/55` quebrado; plano ausente sai "Sem plano" (antes
  "undefined · expira em…"). Chips com `aria-pressed`.
- **Despesas**: excluir pede confirmação (o valor sai do lucro e do relatório) e
  mostra o erro se a exclusão falhar — antes apagava num clique e falhava calado.
  Lista vazia explica o que lançar e onde entra; sem despesas, o lucro avisa que
  "por enquanto é a receita inteira" (produção: 0 despesas).
- Tokens legados `red-*`/`text-warn` trocados pelos atuais (`brand-*`, `warning`)
  em Cobrança, Planos e Despesas.
- Teste: `e2e/cobranca.spec.ts` (filtro de atrasadas, nome abre a ficha; lançar
  despesa, cancelar e confirmar a exclusão).

## Etapa 7 — Acesso, Perfil e Backup (2026-10-23)

Acabamento:
- **A catraca fala português na tela.** `src/lib/access/rotulos.ts` traduz o
  que o agente grava: status do aparelho (Online/Offline/Em manutenção), tipo e
  situação do comando ("Enviar aluno", "Desistiu (falhou várias vezes)"),
  decisão (Liberado/Negado) e motivo curto ("inadimplente", "sem face"). Código
  desconhecido aparece como veio. Indicadores renomeados: "Sem face", "Envio
  pendente"; "heartbeat" virou "último sinal". Simulador e cadastro de face
  usam os mesmos rótulos.
- **Datas no fuso da academia** (`dataHoraNaAcademia`): Acesso, kit do agente
  (Minha conta) e Backup formatavam com `toLocaleString` sem fuso num
  componente que o servidor (UTC no Railway) pinta e o navegador hidrata — o
  horário mudava de 3 h entre os dois.
- Vazios que explicam (comandos, acessos, catracas para quem não é admin,
  backup) e plural certo ("1 conversa guardada").
- `/acesso` usa `requireModulo("acesso")`, o mesmo guard do menu (os três
  papéis têm o módulo; antes era só `requireUser`).
- Teste: `e2e/acesso.spec.ts` semeia um acesso negado e um comando que
  desistiu; `/acesso` e `/perfil` sem nenhum código cru e sem erro de
  hidratação; técnico abre o controle de acesso.

## Fechamento (2026-10-23)

Etapas 0–7 feitas e publicadas. Suíte: 621 testes de unidade (Vitest) e 25
fluxos de navegador (Playwright: fundação, celular, alunos, atendimento,
captação, relatórios, cobrança/despesas, acesso). JS por tela entre 1.414 KB e
1.518 KB; 844 KB disso é o three.js do Coliseu 3D e da malha, fora do escopo
por decisão.
