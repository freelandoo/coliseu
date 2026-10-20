# Fundação visual

**Tabloide futurista (out/2026): preto, papel e vermelho.** Substitui a virada "rubi
profundo + cinza pedra" (o rosa saiu; os tons agora são vermelhos). Referência de
composição: a página Aula experimental. Fonte da verdade dos valores:
`src/app/globals.css` (`@theme` e "Contexto de superfície"). Direção registrada com a
skill de design `design-taste-frontend` (estilo de app `true-black-flat`, semente
1304960682): chão preto único, elevação por degrau de luminosidade, cor só em dado,
seleção e ação.

## Dois contextos de cor

| Contexto | Onde | Fundo | Texto |
| --- | --- | --- | --- |
| **Shell** (padrão, `:root`) | menu, cabeçalho, títulos, painéis escuros (`bg-painel`), tudo direto sobre o fundo | preto `#09090b` com malha de 48px | `#f7f7f5` / `#b9b9c0` / `#9696a0` |
| **Papel** | cards, diálogos, campos, popovers, fundos `*-soft`, `.contexto-papel` | papel `#f3f0e8` | tinta `#151518` / `#4a4a52` |

A troca continua automática (`@layer components`): toda superfície opaca clara — e
`.contexto-papel`, que dá os tokens do papel sem pintar fundo, para painéis cujo papel
é desenhado numa camada recortada — redefine os tokens neutros para dentro dela.
Dentro do papel, `color-scheme` volta a `light` (select e data nativos claros); a raiz
é `dark`.

**Marca e estados são fixos** (calibrados para o papel). O vermelho de marca
`#b0121c` dá 2,8:1 sobre o preto: **nunca vira texto no escuro**. Texto de ênfase usa
`destaque` (contextual: `#ff4b3e` no preto, `#b0121c` no papel); texto de erro usa
`alerta` (contextual: `#ff7a6e` no preto, `#a3200f` no papel). Marca e erro são os dois
vermelhos — por isso erro e estado andam sempre com ícone e texto (`BadgeStatus`,
`EstadoVazio`, `MensagemErro`).

## Paleta

| Token | Shell | Papel | Uso |
| --- | --- | --- | --- |
| `bg` / `bg-deep` / `menu` | `#09090b` / `#050506` / `#09090b` | `#e6e1d5` (interno) | fundo |
| `painel` / `painel-2` | `#141417` / `#1c1c21` | — | painéis escuros (degraus, sem borda nem sombra) |
| `surface` / `elevated` | `#f3f0e8` | `#f3f0e8` | papel (sempre opaco) |
| `surface-2` | branco 6% | `#e6e1d5` | hover/seleção neutra; superfície interna |
| `border` / `border-strong` | branco 10% / 20% | `#d6d0c3` / `#bdb6a7` | divisórias |
| `control` | `#6e6e78` | `#857f73` | borda de campo/controle (≥ 3:1) |
| `ink` / `muted` / `faint` | `#f7f7f5` / `#b9b9c0` / `#9696a0` | `#151518` / `#4a4a52` / `#4a4a52` | texto |
| `destaque` / `foco` | `#ff4b3e` | `#b0121c` | texto de seleção; contorno de foco |
| `alerta` | `#ff7a6e` | `#a3200f` | texto de erro |
| `brand` / `-hover` / `-strong` / `-soft` | `#b0121c` / `#940f17` / `#770b12` / `#f3d9d5` | idem | ação principal, seleção, faixa, item ativo |
| `danger` / `-strong` / `-soft` | `#a3200f` / `#7f190b` / `#f6d8d1` | idem | erro, exclusão, falha, atraso |
| `success` / `-soft` | `#146c3a` / `#d6e8d9` | idem | pago, ativo, liberado |
| `warning` / `-soft` | `#8a4b00` / `#f4e2c2` | idem | a vencer, pendência |
| `info` / `-soft` | `#1d4f91` / `#d8e2f0` | idem | informativo |

O papel `#f3f0e8` veio do briefing do tabloide e substitui a decisão anterior pelo
cinza pedra `#d2cfca`.

Raios: os tokens do Tailwind foram encolhidos (`rounded-lg` 4px, `rounded-2xl` 6px) —
geometria quase reta no app inteiro sem caçar classe por classe; `rounded-full` não
muda. Sombras: o papel se separa do preto pelo tom (`--shadow-card` vazio); sombra só
no que flutua (`--shadow-overlay`).

### Contraste medido (WCAG)

| Par | Razão |
| --- | --- |
| ink / muted / faint sobre o preto | 18,55 / 10,20 / 6,79 |
| muted / faint sobre `painel-2` | 8,70 / 5,79 |
| destaque `#ff4b3e` sobre o preto / `painel-2` | 6,00 / 5,11 |
| branco sobre brand / brand-hover | 7,12 / 8,97 |
| tinta / muted sobre o papel | 16,00 / 7,71 |
| brand sobre papel / papel interno / brand-soft | 6,25 / 5,46 / 5,32 |
| danger sobre papel / interno / soft | 6,66 / 5,81 / 5,65 |
| success sobre papel / interno / soft | 5,70 / 4,97 / 5,07 |
| warning sobre papel / interno / soft | 5,97 / 5,21 / 5,35 |
| info sobre papel / interno / soft | 7,15 / 6,24 / 6,22 |
| control sobre o preto / sobre o papel | 3,95 / 3,49 |
| alerta `#ff7a6e` sobre `painel` | 7,23 |

Verificação em tela: o varredor (Playwright) mede todo texto visível contra o fundo
efetivo — o fundo do shell conta como o pior entre `#09090b` e `#141417`, e
`.contexto-papel` conta como papel — em 19 rotas do admin a 1280px: zero ocorrência.

## Tipografia

- **Sora**: texto, controles, formulários.
- **Oswald**: marca, rótulos de indicador, números de destaque (`tabular-nums`).
- **Anton** (`font-manchete`): só manchetes — "Aula experimental" (40–68px), "Agenda
  do dia", o `PageHeader` compacto (28–32px), o nome no menu. Nunca em dado ou campo.
- **IBM Plex Mono** (`meta-mono`): metadados — categoria, trilha, data da agenda, dias
  da semana, numeração editorial. Uso moderado.
- `.font-manchete`, `.meta-mono`, `.listras` e `.corte-canto` moram em
  `@layer components`: utilities (`text-[…]`, `tracking-[…]`) continuam ajustando.
- Campos com 16px no celular (o iOS não dá zoom ao focar) e 14px a partir de `sm`;
  `td`, `th` e `.tabular-nums` usam números tabulares.

## Fundo, menu e cabeçalho

- Fundo: preto liso com malha de 48px em `body::after`, parada, com máscara vertical.
  Sem brilho, sem animação.
- Menu: preto, grupos em mono, item atual com fundo vermelho, texto branco e listras
  diagonais no fim (decoração); contador de não lidas em chip vermelho com anel claro.
  Assinatura (código de barras + "Disciplina / Pessoas / Resultados") só em desktop
  alto (≥ 860px), `aria-hidden`.
- Cabeçalho: opaco, trilha em mono, avatar quadrado. Comportamentos inalterados.

## Componentes editoriais — `src/components/ui/editorial.tsx`

| Peça | Uso |
| --- | --- |
| `CabecalhoEditorial` | categoria mono, manchete, faixa vermelha com listras, linha operacional, ações, decoração estática (só `lg`). Só em tela de referência. |
| `CartaoIndicador` | papel, fio vermelho, numeração "01", valor Oswald. Estados `ok` / `carregando` (barra do tamanho real, sem shimmer) / `erro` ("Indisponível" com ícone — nunca zero falso). Celular: linha (rótulo à esquerda, valor à direita). |
| `PainelAngular` | painel `escuro` ou `papel` com canto cortado; o corte mora em duas camadas `aria-hidden` atrás do conteúdo — foco, sombras e menus nunca são recortados. |
| `FaixaSecao` | título de seção com marcador vermelho e fio. |
| `BadgeStatus` | sucesso / atenção / erro / info / neutro, sempre com ícone e texto. |
| `EstadoVazio` | vazio ou erro dentro do bloco (frame mantido), com ação opcional. |
| `BarraFerramentas` | abas e filtros à esquerda, utilidades à direita. |
| `Listras` | listras diagonais decorativas (cor por `text-*`). |

`PageHeader` (primitives) virou a versão compacta: manchete 28–32px com marcador
vermelho (ou o número em bloco vermelho cortado, quando há `step`).

## Aula experimental (tela de referência)

| Bloco | Fonte / critério |
| --- | --- |
| Linha sob o título | `resumoDoDia`: visitas de hoje e a próxima pela hora da academia; sem nada hoje, a próxima data. |
| 01 Agendadas em {mês} | visitas no **mês exibido no calendário** (acompanha a navegação). |
| 02 Visitas hoje | `data === hoje` no fuso da academia. |
| 03 Próximos 7 dias | de hoje a hoje+6, inclusive. |
| Calendário (~65%) | mês/ano, ‹ ›, Hoje; até duas horas por dia e "+N"; hoje = fio vermelho + rótulo "hoje"; selecionado = fundo vermelho. Teclado: setas, Home/End, PageUp/PageDown; só o dia selecionado entra no Tab. |
| Agenda do dia (~35%) | papel; régua do expediente (6h–22h, `HORA_MIN`/`HORA_MAX`) com as visitas e o "agora"; horário, nome, modalidade, quem marcou, status, "Ver conversa" (`/atendimento?c=`), observação interna recolhida. |
| Filtro | **modalidade** (dado real); indicadores, grade, agenda e lista mudam juntos. |

**Não há "confirmadas" nem "aguardando confirmação":** o modelo `AulaExperimental`
não guarda confirmação nem presença (a mensagem é revisada e enviada pela conversa,
sem retorno de status). O status mostrado é o do relógio (`momentoDaVisita`):
"Agendada", "Agora", "Horário passou" — conferido a cada minuto no fuso da academia.

Estados: carregando (`loading.tsx`, layout final com barras), vazio (zeros reais +
"Nenhuma aula agendada para este dia" + Abrir Atendimento), erro (a leitura falhou →
indicadores "Indisponível" + aviso com Tentar de novo), sem permissão (redireciona,
`requireModulo`). Celular: agenda antes do calendário; tocar num dia rola até a agenda
(as setas do teclado não rolam).

## Espaçamento e toque

Escala do Tailwind (múltiplos de 4px). Alvos de toque: botões `md` ≥ 40px, `lg` ≥
44px; `touch-action: manipulation` em links, botões, abas e selects.

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

## Aliases legados

Mantidos em `@theme` para não quebrar classes existentes. **Não usar em código novo.**

| Classe legada | Aponta para | Observação |
| --- | --- | --- |
| `red`, `red-bright` | `brand` | o uso majoritário era marca/seleção; `text-red-bright` virou `text-destaque` |
| `red-deep` | `brand-strong` | |
| `red-ghost` | `brand-soft` | |
| `ok` / `warn` | `success` / `warning` | mesmo significado |
| `shadow-plate` / `shadow-red` | `shadow-card` / anel vermelho | |
| `.steel-plate` | bloco vermelho do `PageHeader` e do carimbo | nome mantido |

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
- Tabloide (CSS, o conteúdo nunca espera script; regras da skill
  `emil-design-eng`): entrada breve de painéis `.entrada` (opacidade + 8px, 220ms,
  `--atraso` em passos de 50ms); troca de mês `.troca-mes` (180ms, entra pelo lado
  navegado via `--dir`); seleção de dia só com transição de cor (150ms — sem "pop": é
  ação repetida e feita por teclado); botões encolhem 3% ao pressionar; transições com
  propriedades explícitas. Curva `--ease-entrada: cubic-bezier(0.23, 1, 0.32, 1)`.
- A órbita girando da central saiu: virou o `CarimboData`, estático (nada se move de
  forma contínua no CRM).

## PWA

`themeColor`/`theme_color`/`background_color` = `#09090b` (fundo do shell). Convite
de instalação: barra escura baixa com fio vermelho, mesma dispensa de 14 dias e a
mesma reserva de altura (`--altura-convite-total`).
iOS: `statusBarStyle` = `black` — barra opaca escura com relógio e bateria claros;
continua opaca (o recuo `--safe-t` segue 0 no iOS), ao contrário de
`black-translucent`. `public/offline.html` no tema preto e vermelho. Ícones e logo não mudaram.

## Exceções e pendências conhecidas

- Algumas ações principais ainda usam classes locais com aliases (`bg-red …`) em
  `cn()` condicionais (ConectarWhatsapp, NovoCadastro, AcessoDoCadastro,
  ColaboradoresCard, ExportarRelatorio, ConversaPainel). Visual já no tema; migrar
  para `Botao` ao redesenhar essas telas (etapas 4–7).
- Campos de telas grandes (atendimento, filtros) usam `classeCampo*` ou tokens, mas
  nem todos os rótulos estão ligados por `Campo` — só os padrões mecânicos foram migrados.
- Tabloide: só a Aula experimental foi recomposta. Atendimento, Captação, Alunos,
  Cobrança, Despesas, Relatórios e Controle de acesso receberam a identidade pelos
  tokens (preto, papel, vermelho, raios retos, fontes, cabeçalho compacto), sem
  mudança de composição — cada uma mantém a densidade da própria função.
- O menu não recolhe no desktop: abaixo de 1024px vira gaveta (como antes).
- `loading.tsx` da Aula experimental foi conferido por tipo e leitura, não em tela: no
  `next dev` não há prefetch, e o Next mantém a página anterior até o segmento chegar.
- Relatórios e telas financeiras herdaram shell e superfícies, mas não foram
  redesenhados; a composição deles segue a da Etapa 1.
- Verificação feita em base Postgres isolada e descartável com fixtures fictícias
  identificadas ("Fixture …"); nada foi gravado na base de desenvolvimento nem em produção.
