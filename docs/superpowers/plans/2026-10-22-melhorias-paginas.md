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
