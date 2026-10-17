# Fundação visual

**Virada visual (out/2026): rubi profundo + cinza pedra quente.** Substitui a base
clara da Etapa 1. Fonte da verdade dos valores: `src/app/globals.css` (`@theme` e
"Contexto de superfície"). Este documento explica as decisões, as variantes e o que
ficou de fora.

## Dois contextos de cor

| Contexto | Onde | Fundo | Texto |
| --- | --- | --- | --- |
| **Shell** (padrão, `:root`) | menu, cabeçalho, títulos de página, tudo que fica direto sobre o fundo | vinho/rubi `#21070f` texturizado | claro `#f7eff2` / `#c4aeb7` |
| **Superfície** | cards, diálogos, campos, popovers, fundos "soft" | cinza pedra quente `#d2cfca` | grafite `#22232b` / `#50525d` |

A troca é automática: toda superfície opaca (`.bg-surface`, `.bg-elevated`,
`.bg-white` e os fundos `*-soft`) redefine os tokens neutros para dentro dela
(`@layer components`, abaixo das utilities — a cor que o elemento declarar continua
valendo). Por isso `text-ink`, `text-muted`, `border-border` e `bg-surface-2` não
precisam de variante: são claros/translúcidos no fundo escuro e grafite/cinza dentro
do card. Dentro de uma superfície, `bg-surface-2`, hover e seleção trocam o texto
secundário para `#464852` (mais escuro, para o cinza interno).

**Marca e estados são fixos** (calibrados para o cinza pedra). Texto de seleção ou
ênfase usa **`destaque`** — o único token de cor contextual: rosa `#f08ca6` no fundo
escuro, rubi `#8d173b` na superfície. Todo `text-brand` antigo virou `text-destaque`
(idêntico dentro dos cards). O contorno de foco segue o mesmo contexto (`--color-foco`).

## Paleta

| Token | Shell | Superfície | Uso |
| --- | --- | --- | --- |
| `bg` / `bg-deep` / `menu` / `luz` | `#21070f` / `#16070b` / `#18080e` / `#68132e` | — | fundo, profundidade, menu, luz rubi |
| `surface` / `elevated` | `#d2cfca` | `#d2cfca` | cards, diálogos, campos (sempre opacos) |
| `surface-2` | véu claro 7% | `#c4c0ba` | hover/seleção neutra; superfície interna |
| `border` / `border-strong` | rosa 13% / 26% | `#aca7a0` / `#958f88` | divisórias (decorativas) |
| `control` | `#8f7480` | `#6e6963` | borda de campo/seleção (≥ 3:1) |
| `ink` / `muted` / `faint` | `#f7eff2` / `#c4aeb7` / `#ae929e` | `#22232b` / `#50525d` / `#50525d` | texto |
| `destaque` / `foco` | `#f08ca6` | `#8d173b` | texto de seleção; contorno de foco |
| `brand` / `-hover` / `-strong` / `-soft` | `#8d173b` / `#6c1531` / `#5a0f27` / `#cdbec1` | idem | ação principal e seleção |
| `acao` | `#84213f` | idem | botão/dia/avatar selecionado da central |
| `danger` / `-strong` / `-soft` | `#8f1f16` / `#6f170f` / `#d8c2bd` | idem | erro, exclusão, falha, atraso |
| `success` / `-soft` | `#0e5733` / `#c2ccc2` | idem | pago, ativo, liberado |
| `warning` / `-soft` | `#773905` / `#d9cbb5` | idem | a vencer, atenção |
| `info` / `-soft` | `#1a458f` / `#c3c8d2` | idem | informativo |

Os `*-soft` foram puxados para a família do cinza quente — nada de bloco quase
branco dentro do card. O cinza pedra `#d2cfca` foi escolhido pelo usuário: não
substituir por branco, off-white ou o cinza frio antigo.

### Contraste medido (WCAG)

| Par | Razão |
| --- | --- |
| ink sobre surface / surface-2 | 10,06 / 8,63 |
| muted `#50525d` sobre surface | 5,00 |
| muted interno `#464852` sobre surface-2 / brand-soft | 5,02 / 5,08 |
| brand sobre surface / surface-2 / brand-soft | 5,83 / 5,00 / 5,06 |
| branco sobre brand; `#f7eff2` sobre acao | 9,06 / 8,19 |
| danger sobre surface / surface-2 / danger-soft | 5,69 / 4,88 / 5,21 |
| success sobre surface / surface-2 / success-soft | 5,56 / 4,77 / 5,23 |
| warning sobre surface / surface-2 / warning-soft | 5,70 / 4,89 / 5,55 |
| info sobre surface / surface-2 / info-soft | 5,90 / 5,06 / 5,46 |
| borda `control` sobre surface / sobre o fundo | 3,50 / 4,52 |
| shell: ink / muted / faint sobre `#21070f` | 16,86 / 9,15 / 6,72 |
| shell: muted sobre a luz rubi `#68132e` (pior caso) | 5,86 |
| destaque/foco rosa sobre o fundo; texto vinho sobre o chip rosa | 8,17 / 8,17 |
| abertura da central: `#d6a1b2` / `#dfaabd` sobre o fundo | 8,71 / 9,64 |

Verificação em tela: um varredor (Playwright) mede todo texto visível contra o fundo
efetivo (compondo translúcidos; o fundo do shell conta como o pior entre `#21070f` e a
luz `#68132e`) em 19 rotas do admin, nas telas da recepção e no login, a 1280 e 390px.
Ficou zero ocorrência real (a única marcação restante é o número branco sobre a marca
rubi do calendário, um irmão absoluto que o varredor não enxerga — 9,06:1).

## Fundo, menu e cabeçalho

- Fundo: `body::before`/`::after` fixos atrás de tudo — luz rubi localizada,
  trama diagonal fina e malha de 48px com máscara. Só gradientes: sem imagem remota,
  vídeo ou ruído por quadro. As superfícies são opacas, então a textura nunca fica
  atrás de texto de tabela, campo ou mensagem.
- Menu: `bg-menu`, grupos em caixa alta pequena, item atual com gradiente rubi e
  marcador rosa colado na borda; contador de não lidas em chip rosa (8,17:1).
- Cabeçalho: quase opaco (`bg-bg/92`, sem `backdrop-filter`), trilha, sino e atalho
  de conta (iniciais + nome a partir de `md`) para Minha conta.

## Central do admin (`/painel`)

ADMIN entra nela depois do login (`rotaInicial`); recepção continua no Atendimento,
técnico na catraca. Não há `returnTo`: o proxy manda ao /login sem guardar a rota.
`requireModulo("painel")` barra os outros papéis antes de qualquer consulta.

| Bloco | Fonte | Rótulo / critério |
| --- | --- | --- |
| Alunos ativos | `contarAlunosAtivosRepo` | fase aluno e **última** matrícula `ACTIVE` — o mesmo filtro de `/matriculados?situacao=ativo` |
| Mensagens não lidas | `totaisNaoLidasRepo` | soma de MENSAGENS (o número do menu) + quantas CONVERSAS as têm |
| Cobranças em aberto | `cobrancasEmAbertoRepo` | status `pendente` + `atrasado`, posição na hora em que a página abriu. Não é receita, caixa nem MRR |
| Atendimento agora | `conversasComNaoLidasRepo` (filtro `naoLidas > 0` no banco) e `paginaConversasRepo({limite: 6})` | prévia = `ultimaMensagemPreview`; ler aqui **não** marca como lida; acesso em `/atendimento?c=<id>` |
| Aulas experimentais | `listarAulasExperimentaisEntreRepo(hoje, hoje+6)` | agendamentos; sem vagas, presença ou confirmação. Acesso em `/aula-experimental?dia=AAAA-MM-DD` (novo parâmetro, validado por `ehDataISO`) |
| Fechamento | `cobrancasEmAbertoRepo` | atrasadas (qtd + valor) e atalhos para Matrículas e renovações / Alunos |

Cada bloco tem seu `Suspense` (carregando) e trata falha como **indisponível**, nunca
zero; uma consulta fora do ar não apaga os outros blocos. O token Freelandoo saiu do
corpo da página para um `<details>` recolhido no fim. Saíram o pipeline com a
"conversão" antiga e o "risco de evasão" (calculado sobre a data fixa do mock).

## Tipografia

- Sora no texto e nos controles; Oswald no lettering da marca, títulos de página e
  números de destaque. A abertura da central usa Sora grande (clamp 28–48px).
- Conteúdo comum 13–14px; 11–12px só em anotações (subtítulo da marca, rótulos de grupo).
- Campos com 16px no celular (o iOS não dá zoom ao focar) e 14px a partir de `sm`.
- `td`, `th` e `.tabular-nums` usam números tabulares.

## Espaçamento, raios e sombras

Escala do Tailwind (múltiplos de 4px). Raios: `rounded-lg` (controles), `rounded-2xl`
(16px — `Card` e diálogos) e 18px nos painéis da central. Sombras curtas tingidas pelo
fundo (`shadow-card`, `shadow-overlay`); reflexo só no fundo, conteúdo limpo.
Alvos de toque: botões `md` ≥ 40px, `lg` ≥ 44px.

## Aliases legados

Mantidos em `@theme` para não quebrar classes existentes. **Não usar em código novo.**

| Classe legada | Aponta para | Observação |
| --- | --- | --- |
| `red`, `red-bright` | `brand` | o uso majoritário era marca/seleção; `text-red-bright` virou `text-destaque` |
| `red-deep` | `brand-strong` | |
| `red-ghost` | `brand-soft` | |
| `ok` / `warn` | `success` / `warning` | mesmo significado |
| `shadow-plate` / `shadow-red` | `shadow-card` / anel rubi | |
| `.steel-plate` | marcador rubi do `PageHeader` | nome mantido |

Todo vermelho que significava **estado** foi migrado para `danger` (classificado
linha a linha): mensagens de erro, "Falhou"/"Não liberou", acesso negado no
simulador, comando com falha, "não entregue", lead perdido, ausência na retenção,
valores de despesa (convenção financeira de saída), excesso de caracteres, ponto de
gravação e as ações Excluir/Remover/Desativar/Parar. `Badge`/`Stat` aceitam
`tone="danger"`; o antigo `tone="red"` saiu do tipo.

## Componentes

### `Botao` / `classeBotao` — `src/components/ui/Botao.tsx`

Variantes: `primario`, `contorno`, `secundario`, `discreto`, `perigo`, `perigo-contorno`.
Tamanhos: `sm`, `md`, `lg`; `bloco` ocupa a largura.

- `type="button"` por padrão (o app não tem `<form>`; submit só se pedido).
- `carregando` = `disabled` + `aria-busy` + indicador; usado só onde o botão já era
  desabilitado durante o processamento. O texto ("Salvando…") continua do consumidor.
- `classeBotao()` serve a `<a>`/`<Link>`: link continua link.
- Largura e margem vêm do `className` do consumidor (o `cn` não resolve conflitos).

### `Campo`, `classeCampo`, `classeCampoEmLinha`, `classeCampoCompacto`, `classeRotulo`, `MensagemErro` — `src/components/ui/Campo.tsx`

- `Campo` liga rótulo (`htmlFor`/`id` estável via `useId`), ajuda e erro
  (`aria-describedby`) e marca `aria-invalid`. O controle continua do consumidor
  (valor, máscara, handlers, validação).
- Erro nunca só por cor: ícone + texto.
- `MensagemErro` tem `role="alert"` (anunciada quando aparece).
- Rótulos soltos acima de um único campo viraram `<label>` envolvendo o controle.

### `Modal`, `TituloModal`, `DescricaoModal` — `src/components/ui/Modal.tsx`

- Portal no `body`, centralização por `m-auto` (conteúdo alto rola inteiro), safe areas.
- Nome acessível por `TituloModal` (`aria-labelledby`) ou `rotulo`; aviso em dev se faltar.
- Foco inicial: `autoFocus`/`[data-autofocus]`; sem isso, o próprio diálogo (em
  confirmação, Enter não dispara a ação por acidente). Tab/Shift+Tab contidos;
  ao fechar, o foco volta ao acionador.
- Fundo `inert` e rolagem do `body` travada com contador (diálogos empilhados).
- Pilha: só o diálogo do topo responde a Esc e Tab.
- Clique no véu não move o foco e **não fecha** por padrão (`fecharAoClicarFora` só em avisos).
- `onFechar` omitido = não dispensável pelo teclado; `fecharComEsc={false}` durante operações.

Política de fechamento por consumidor:

| Diálogo | Esc | Clique fora | Durante processamento |
| --- | --- | --- | --- |
| Troca de senha obrigatória | não | não | — (Sair continua dentro do diálogo) |
| Remover cadastro (`RemoverPessoa`) | sim | sim (já era) | bloqueado |
| Pagamento confirmado (`MatriculaFlow`) | sim | sim (já era) | — |
| Plano (`GestaoPlanos`), despesa (`CustosView`), mescla, checkout, renovação | sim | não | Esc bloqueado; Cancelar como antes |
| Demais consumidores já existentes | como antes (Esc fecha) | não | como antes |

Diálogos na infraestrutura compartilhada: BackupView (2), ConectarWhatsapp,
ConversaPainel (remover/limpar), AcessoDoCadastro (2), NovoCadastro, RemoverPessoa,
GestaoPlanos, MesclarPlanos, CustosView, CheckoutBalcao, MatriculaFlow,
RenovarModal, ColaboradoresCard (2), TrocaSenhaObrigatoria.

Fora de propósito (não são diálogos de formulário): gaveta do menu (`Sidebar`) e
popover de notificações (`NotificationBell`) — só receberam o véu/tokens novos.

### Primitivos — `src/components/ui/primitives.tsx`

`Card`, `Badge`, `Stat`, `PageHeader` mantêm props e dados; `Tone` ganhou
`brand`, `danger`, `success`, `warning`, `info` (com `ok`/`warn` como aliases).

## Movimento — `src/lib/movimento.ts`

- Curto (150–400ms), só opacidade/transform, sem rebote; entrada do diálogo 160ms.
- CSS: `prefers-reduced-motion` zera transições e keyframes (`globals.css`).
- GSAP: cada animação consulta `prefereMovimentoReduzido()` no momento em que roda.
  - Decorativas (`Reveal`, calendário, gráficos e contadores do relatório): não
    animam; o conteúdo já nasce no estado final (contadores renderizam o valor final).
  - Timelines com fluxo de negócio (`MatriculaFlow` → `finalizar()`,
    `RenovarModal` → fase seguinte): `concluirSeReduzido(tl)` salta ao fim e dispara
    cada `onStart` e o `onComplete` **uma única vez**, na mesma ordem — coberto por
    `src/lib/movimento.test.ts`. O disparador original da operação não mudou.
- Mudar a preferência depois não reexecuta nada.
- Central (`/painel`), em CSS para o conteúdo nunca esperar script: entrada
  coordenada `.entrada` (opacidade + 14px, 560ms, atrasos 0/80/130/160/230/300ms);
  troca de conversa/dia `.troca` (200ms); órbita decorativa `.orbita-giro` (28s por
  volta) com botão de pausa, parada com a aba oculta (`visibilitychange`) e ausente
  em movimento reduzido (`OrbitaData`, via `CONSULTA_MOVIMENTO_REDUZIDO`). Os arcos
  não representam nenhum indicador.

## PWA

`themeColor`/`theme_color`/`background_color` = `#21070f` (fundo do shell).
iOS: `statusBarStyle` = `black` — barra opaca escura com relógio e bateria claros;
continua opaca (o recuo `--safe-t` segue 0 no iOS), ao contrário de
`black-translucent`. `public/offline.html` no tema escuro. Ícones e logo não mudaram.

## Exceções e pendências conhecidas

- Algumas ações principais ainda usam classes locais com aliases (`bg-red …`) em
  `cn()` condicionais (ConectarWhatsapp, NovoCadastro, AcessoDoCadastro,
  ColaboradoresCard, ExportarRelatorio, ConversaPainel). Visual já no tema; migrar
  para `Botao` ao redesenhar essas telas (etapas 4–7).
- Campos de telas grandes (atendimento, filtros) usam `classeCampo*` ou tokens, mas
  nem todos os rótulos estão ligados por `Campo` — só os padrões mecânicos foram migrados.
- Relatórios e telas financeiras herdaram shell e superfícies, mas não foram
  redesenhados (fora do escopo da virada); a composição deles segue a da Etapa 1.
- Verificação feita em base Postgres isolada e descartável com fixtures fictícias
  identificadas ("Fixture …"); nada foi gravado na base de desenvolvimento nem em produção.
