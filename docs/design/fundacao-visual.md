# Fundação visual (Etapa 1)

Base clara, identidade vermelho-rubi, estados operacionais separados da marca.
Fonte da verdade dos valores: `src/app/globals.css` (`@theme`). Este documento
explica as decisões, as variantes e o que ficou de fora.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `bg` | `#f7f7f8` | fundo da página |
| `surface` / `elevated` | `#ffffff` | cards, diálogos, campos |
| `surface-2` | `#f2f3f5` | hover neutro, campo desabilitado |
| `border` | `#e3e5e8` | divisórias e bordas de card (decorativas) |
| `border-strong` | `#c8cbd0` | borda do botão secundário (o texto identifica o botão) |
| `control` | `#878c96` | borda de campo/seleção — 3,38:1 sobre branco |
| `scrim` | grafite 48% | véu de diálogo e da gaveta do menu |
| `ink` / `muted` / `faint` | `#1b1e23` / `#4a505a` / `#5f6570` | texto principal / apoio / auxiliar |
| `brand` / `-hover` / `-strong` / `-soft` | `#880d32` / `#6d0a28` / `#540d23` / `#fff4f6` | marca, seleção, ação principal |
| `danger` / `-strong` / `-soft` | `#b42318` / `#912018` / `#fef3f2` | erro, exclusão, falha, atraso |
| `success` / `-soft` | `#067647` / `#ecfdf3` | pago, ativo, liberado |
| `warning` / `-soft` | `#b54708` / `#fffaeb` | a vencer, atenção |
| `info` / `-soft` | `#175cd3` / `#eff8ff` | informativo |

### Contraste medido (WCAG, relação de luminância)

| Par | Razão |
| --- | --- |
| ink sobre surface / bg / surface-2 | 16,71 / 15,61 / 15,05 |
| muted sobre surface / bg / surface-2 | 8,12 / 7,58 / 7,31 |
| faint sobre surface / bg / surface-2 / brand-soft | 5,86 / 5,48 / 5,28 / 5,45 |
| brand sobre surface / bg / brand-soft / surface-2 | 9,77 / 9,12 / 9,08 / 8,80 |
| branco sobre brand / brand-hover | 9,77 / 12,18 |
| danger sobre surface / danger-soft; branco sobre danger | 6,57 / 6,05 / 6,57 |
| success sobre surface / success-soft | 5,69 / 5,40 |
| warning sobre surface / warning-soft | 5,43 / 5,20 |
| info sobre surface / info-soft | 5,99 / 5,57 |
| borda `control` sobre surface / bg | 3,38 / 3,15 |
| foco (contorno brand, 2px, offset 2px) sobre branco | 9,77 |
| borda `brand/60` (chip ativo) sobre branco | 3,75 |
| texto success sobre `success/10` · `success/15` (legado) | 4,92 · 4,57 |
| texto warning sobre `warning/10` (legado) | 4,72 |

Texto comum ≥ 4,5:1 e foco/controles ≥ 3:1 em todos os pares usados. Bordas
`brand/40`, `success/40` e `warning/40` (≈1,9–2,3:1) são decorativas — o estado é
sempre dito pelo texto do badge/linha. Botões desabilitados (opacidade 55%) estão
fora do requisito de contraste.

## Aliases legados

Mantidos em `@theme` para não quebrar classes existentes. **Não usar em código novo.**

| Classe legada | Aponta para | Observação |
| --- | --- | --- |
| `red`, `red-bright` | `brand` | o uso majoritário era marca/seleção |
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

## Tipografia

- Sora no texto e nos controles; Oswald só em títulos de página/seção e números de destaque (`Stat`).
- Caixa alta e `tracking-wid*` removidos de controles, abas, cabeçalhos de tabela e rótulos.
  Exceção deliberada: o lettering do produto ("Coliseu CRM" / "Academia Coliseu Team") na Sidebar e no login.
- Nada abaixo de 12px: `text-[9px|10px|11px]` viraram `text-xs`.
- Campos com 16px no celular (o iOS não dá zoom ao focar) e 14px a partir de `sm`.
- `td`, `th` e `.tabular-nums` usam números tabulares.

## Espaçamento, raios e sombras

Escala do Tailwind (múltiplos de 4px). Raios: `rounded-lg` (controles) e `rounded-xl`
(cards e diálogos). Sombras: `shadow-card` (cards) e `shadow-overlay` (diálogos).
Alvos de toque: botões `md` ≥ 40px, `lg` ≥ 44px.

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

## PWA

`themeColor`/`theme_color` = `#ffffff`, `background_color` = `#f7f7f8`.
iOS: `statusBarStyle` passou de `black-translucent` para `default` — o primeiro
desenha relógio e bateria em branco, ilegíveis sobre o topo branco. Com `default` a
barra é opaca e o recuo `--safe-t` vale 0 no iOS; no Android edge-to-edge segue igual.
`public/offline.html` no tema claro. Ícones e logo não mudaram.

## Exceções e pendências conhecidas

- Algumas ações principais ainda usam classes locais com aliases (`bg-red …`) em
  `cn()` condicionais (ConectarWhatsapp, NovoCadastro, AcessoDoCadastro,
  ColaboradoresCard, ExportarRelatorio, ConversaPainel). Visual já no tema; migrar
  para `Botao` ao redesenhar essas telas (etapas 4–7).
- Campos de telas grandes (atendimento, filtros) usam `classeCampo*` ou tokens, mas
  nem todos os rótulos estão ligados por `Campo` — só os padrões mecânicos foram migrados.
- Telas autenticadas não foram vistas no navegador: sem banco sintético isolado neste
  ambiente. A verificação de interface usou uma vitrine temporária com os componentes
  da fundação (não versionada).
