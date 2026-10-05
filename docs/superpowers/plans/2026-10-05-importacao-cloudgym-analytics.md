# Importação completa do CloudGym + aba Analytics — análise e plano de mapeamento

**Data:** 2026-10-05 · **Status:** aguardando aprovação (nada foi escrito no banco)
**Origem:** `PROMPT_MASTER_Migracao_CloudGym_Coliseu.md` + 40 CSVs exportados em 2026-10-05.
**Onde estão os dados:** `usuarios/cloudgym-2026-10/` (fora do git, LGPD). O prompt sugere `data/cloudgym/`; mantive a convenção do repo (`usuarios/` já é gitignorado e é onde moram os exports de julho).

Adaptações ao stack real: o projeto é Next.js 16 + Prisma 6 + Postgres no Railway, sem Supabase. "RLS por unidade" vira filtro por `unitId` na camada de consulta + checagem de papel (`requireModulo`), que é o padrão do código hoje.

---

## 1. Veredito por arquivo

Legenda — **IMPORTAR**: fonte primária, vira tabela de domínio · **DERIVÁVEL**: sai de outra fonte; usar só para conferência · **DUPLICADO**: mesmo dado de outro arquivo · **PARCIAL**: apagar.

| Arquivo | Linhas | Veredito | Por quê |
|---|---:|---|---|
| clientes_ativos | 832 | **IMPORTAR** | ficha + vigência; 0 ids em comum com inativos |
| clientes_inativos_completo | 13.129 | **IMPORTAR** | completo (o de julho vinha truncado em ~1.000) |
| clientes_inativos | 1.000 | PARCIAL | 1.000/1.000 contidos no completo |
| recebimentos_previsto_competencia | 84.872 | **IMPORTAR** | todas as parcelas, 2008→2027; base do financeiro |
| recebimentos_realizado_caixa | 25.448 | DUPLICADO | 25.447 contidos no previsto por `payment_id` (investigar 1) |
| receitas_por_plano_conta | 49.194 | DUPLICADO → vira coluna | 49.193 casam com parcelas (cliente+data+valor): é a **classificação contábil** da parcela, não um lançamento novo |
| taxas_pagamento | 13.230 | **IMPORTAR** | taxa de adquirência (conta 38039 "Bancos"), não está nas parcelas |
| vendas_planos | 17.179 | **IMPORTAR** | agregado dia × plano × vendedor; única fonte de vendedor nas vendas antigas |
| livro_caixa_vendido_servicos | 17.790 | **IMPORTAR** (1 tabela) | 17.090 idênticos ao "recebido"; guardar uma vez com flags vendido/recebido |
| livro_caixa_recebido_servicos | 17.670 | DUPLICADO | idem |
| livro_caixa_vendido/recebido_operacional | 14 + 14 | IMPORTAR 1× | os dois arquivos são idênticos |
| livro_caixa_vendido/recebido_produtos | 56 + 56 | DUPLICADO | idênticos entre si e iguais ao PDV |
| vendas_produtos (PDV) | 56 | **IMPORTAR** | tem o split por forma de pagamento; vendas de 2019→2021 |
| vendas_produtos_drill | 41 | DERIVÁVEL | classificação contábil do PDV |
| frequencia_checkins | 257.513 | **IMPORTAR** | sem id; **99,4% vinculam** (email 203k, celular 28k, nome único 25k; 1.462 sem par) |
| auditoria | 12.078 | **IMPORTAR** | tabela própria de legado, separada do `AuditLog` |
| nps | 52 | **IMPORTAR** | 43 clientes, todos encontrados |
| notas_fiscais | 6 | IMPORTAR (baixo valor) | 3 emitidas, 3 com erro, de 2014–2017 |
| pendencias_pagamento | 91 | DERIVÁVEL | parcelas vencidas sem pagamento; usar para conferir (91 = 91) |
| planos | 460 | **IMPORTAR** | catálogo com **preço** (277 `deleted`) — resolve os 26 planos sem valor |
| produtos | 14 | IMPORTAR | estoque não é controlado (`controlStock=false` em todos) |
| aulas_grade | 32 | **IMPORTAR** | 4 modalidades, 5 professores |
| plano_de_contas_completo | 72 | **IMPORTAR** | árvore pai→filho |
| plano_de_contas | 72 | DUPLICADO | subconjunto do completo |
| audiencia_leads_completo | 4.046 | **IMPORTAR** | leads 2019→2026 |
| audiencia_leads | 1.000 | PARCIAL | 1.000/1.000 contidos no completo |
| leads_pipeline | 158 | IMPORTAR (histórico) | cards de 2019–2022, colunas `campo_3..7` vazias ou zeradas |
| equipe_usuarios | 47 | **IMPORTAR** | cargos: 23 professores, 11 recepção, 8 gerentes, 3 limpeza |
| vendedores / professores | 47 / 44 | DUPLICADO | todos os ids estão em equipe_usuarios |
| aniversariantes | 126 | DERIVÁVEL | sai de `birthDay` |
| clientes_ausentes | 294 | DERIVÁVEL | sai dos check-ins |
| contratos_a_vencer | 87 | DERIVÁVEL | sai de `endDate` |
| clientes_por_unidade | 1 | DERIVÁVEL | conferência (835 / 13.167 / 14.002) |
| contratos_ativos_por_plano | 34 | DERIVÁVEL | conferência (soma 842 > 832 ativos: há quem tenha 2 contratos) |
| bancos | 2 | IMPORTAR (só ADMIN) | agência/conta/saldo |
| unidade | 1 | IMPORTAR | completa o `Unit` |

**Resultado:** 40 arquivos → **22 importados**, 18 descartados (2 parciais, 9 duplicados, 7 deriváveis usados só para conferência).

## 2. Validações do prompt (feitas no dry-run de análise)

| Checagem | Esperado | Encontrado |
|---|---|---|
| Ativos | 832 (resumo diz 835) | 832 — diferença de 3 a investigar no import |
| Inativos | 13.129 | 13.129 |
| Check-ins/ano | 2020 12.375 · 2021 15.355 · 2022 30.287 · 2023 37.910 · 2024 55.246 · 2025 61.614 · 2026 44.726 | **idêntico** |
| Pendências | 91 | 91 (todos com cliente encontrado) |
| Parcelas com cliente encontrado | — | 13.371 de 13.389 clientes |

## 3. Impacto na base que já está em produção

Cruzando com as 2.142 pessoas do Coliseu em produção:

- **Dos 832 ativos do CloudGym, 612 já existem no Coliseu** (591 por CPF, 21 por nome). **220 são novos**: entraram depois de julho ou ficaram de fora da adoção.
- **Dos 721 alunos do Coliseu, 115 não estão entre os ativos do CloudGym. Desses, 110 aparecem como inativos lá**: evadiram depois de julho e no Coliseu continuam "aluno".
- **Órfãos da catraca:** dos 240 marcados para exclusão, **207 casam 1:1 com inativos completos**, 3 ficam ambíguos, 13 têm só o primeiro nome e 17 continuam sem par. Isso confirma a decisão de julho: são ex-alunos e a exclusão continua certa, agora com prova.
- **Bloqueador B1 do corte** (693 ativos sem nenhum `Payment`): as 75 mil parcelas pagas resolvem com dado real. A última parcela de cada aluno vira o `Payment` que a política da catraca lê. Isso substitui o "pagamento legado" sintético proposto no plano de corte.

## 4. Mapeamento CSV → tabelas

Toda entidade migrada ganha `legacyCloudgymId` com índice único. O import é upsert por esse id, então rodar de novo com um export mais novo só atualiza.

| Destino | Origem | Observação |
|---|---|---|
| `Unit` (+ campos cadastrais) | unidade | razão social, CNPJ, endereço |
| `ContaBancaria` (nova, só ADMIN) | bancos | nunca exposta fora do perfil ADMIN |
| `Colaborador` (nova, sem login) | equipe_usuarios | cargo; vínculo opcional com `User` depois. **Não cria acesso** |
| `ContaContabil` (nova, árvore) | plano_de_contas_completo | pai/filho, débito/crédito |
| `Plan` (+ legacyId, meses, taxaMatricula, contaContabilId) | planos | `deleted` ⇒ `ativo=false`; `duracaoDias` sai de `months` |
| `Produto` (nova) | produtos | |
| `AulaGrade` (nova) | aulas_grade | dia, hora, capacidade, professor (`Colaborador`) |
| `Person` (+ legacyId, legacyName, genero, telefoneFixo, inativadoEm, nps) | clientes_ativos + inativos_completo | casa primeiro por legacyId, depois CPF válido, depois nome único (reaproveita a lógica de `src/lib/migracao`) |
| `HistoricoPlano` (nova) | coluna `plan` (até 42 segmentos separados por `\|`) | match com `Plan` por nome normalizado |
| `Membership` | startDate/endDate do ativo | só a vigente; histórico fica em `HistoricoPlano` |
| `Parcela` (nova) | recebimentos_previsto + classificação de receitas_por_plano_conta | vencimento, pagamento, compensação, bruto, líquido, forma, bandeira, **cartão só os 4 últimos dígitos**, NSU, gateway, status, tipo, `contaContabilId` |
| `Payment` (existente) | última parcela paga de cada ativo | alimenta a política da catraca (resolve B1) |
| `TaxaPagamento` (nova) | taxas_pagamento | |
| `VendaPlanoDia` (nova, agregado) | vendas_planos | |
| `LancamentoCaixa` (nova) | livro_caixa servicos (unificado) + operacional | flags `vendido`/`recebido` |
| `VendaPdv` (nova) | vendas_produtos | |
| `CheckIn` (nova) | frequencia_checkins | `personId` via email → celular → nome único; sem par vai para `ImportIssue` |
| `NpsResposta` (nova) | nps | |
| `NotaFiscal` (nova) | notas_fiscais | |
| `AuditoriaLegado` (nova) | auditoria | não mistura com o `AuditLog` novo |
| `Person` fase=lead (+ legacyLeadId) | audiencia_leads_completo + leads_pipeline | dedupe contra os 1.421 leads atuais por telefone/email |
| `Despesa` (+ contaContabilId) | — | estrutura pronta para o CSV de despesas que ainda vai ser exportado (ver seção 6 do prompt) |
| `ImportRun`, `ImportIssue`, `StgCloudgymRow` (novas) | todos | staging numa tabela só (`arquivo`, `linha`, `dados jsonb`) em vez de 40 tabelas `stg_*` |

Limpeza (seção 3 do prompt), com o que os dados mostraram:
- **Cidade:** 13 grafias só nos ativos ("SAO BERNARDO DO CAMPO", "sao bernardo do campo", "Sa"…) → tabela de normalização.
- **Datas de nascimento absurdas** (de 0001 a 8198) → `null` + `ImportIssue`.
- **Cartão:** a parcela traz o número; gravar só os 4 últimos dígitos. O número completo nunca toca o banco.
- **Nomes:** Title Case com partículas, original em `legacyName`.

## 5. Relatórios: o que já existe, o que funde, o que é novo

O Coliseu já tem: `/painel` (tiles), `/matriculados` (lista, retenção, fidelidade + indicadores, renovar), `/cobranca` (a vencer, atrasadas, a renovar), `/custos` (despesas e lucro), `/captacao` (funil), `/relatorios` (Marketing e Financeiro em PDF/planilha), `/acesso` (giros) e `/atendimento/uso`.

| # | Relatório do prompt | Já existe? | Decisão |
|---|---|---|---|
| 1 | Clientes Ativos | `/matriculados` (lista operacional) | **Funde**: a lista continua sendo o lugar de trabalhar; o Analytics ganha a versão completa com todas as colunas e exportação |
| 2 | Clientes Inativos | "Base de reativação" no Relatório de Marketing | **Amplia** com os 13 mil históricos |
| 3 | Aniversariantes | bloco do Relatório de Marketing (mês seguinte) | **Funde**: vira relatório com mês/intervalo + botão de WhatsApp |
| 4 | Ausentes | `/matriculados/retencao` + Marketing (7+ dias) | **Funde**: um só, parâmetro X dias (padrão 30), lendo check-ins legados + giros novos |
| 5 | Clientes por Unidade | — | card no dashboard (unidade única hoje) |
| 6 | Contratos a Vencer | `/cobranca` "A vencer / A renovar" | **Continua** em Cobrança; o Analytics só aponta para lá |
| 7 | Frequência (gráficos hora/dia × sexo) | — | **Novo** (257 mil check-ins + `AccessEvent`) |
| 8 | Contratos ativos por plano | "Receita recorrente por plano" no Financeiro | **Amplia** com drill-down para a lista |
| 9 | NPS | — | **Novo** |
| 10 | Entrada de Receita / Conciliação | "Recebimentos" e "Entradas por forma" no Financeiro | **Amplia**: 3 visões (previsto competência, realizado competência, realizado caixa) |
| 11 | Pendência de Pagamento | `/cobranca` atrasadas + "Alunos inadimplentes" | **Funde** num só |
| 12 | Fluxo de Caixa | parcial em `/custos` | **Novo** (matriz período × plano de contas) |
| 13 | Livro Caixa | — | **Novo** |
| 14 | Drill Down Financeiro | — | **Novo** |
| 15 | DRE | "Resultado" em `/custos` | **Novo**, incompleto até chegarem as despesas |
| 16 | Nota Fiscal | — | Novo, baixa prioridade (6 registros) |
| 17 | Bancos | — | Novo, só ADMIN |
| 18 | Vendas (Planos) | "Quem fechou" no Marketing | **Amplia** com ranking e histórico desde 2008 |
| 19 | Lista de Vendas PDV | — | Novo, baixa prioridade (56 vendas, última em 2021) |
| 20 | Estoque | — | **Proposta: não fazer agora** (estoque nunca foi controlado no CloudGym) |
| 21 | Grade de Aulas | — | **Novo** |
| 22 | Ocupação/Bookings | — | só estrutura (não há dado) |
| 23 | Audiência (Leads) | `/captacao` | **Funde**: histórico dos 4 mil leads entra no funil existente |
| 24 | Pipeline | `/captacao` (funil por estágio) | **Continua**; os 158 cards de 2019–2022 entram como histórico |
| 25 | Auditoria | `AuditLog` sem tela | **Novo**: legado + log novo na mesma tela |
| 26 | Dashboard / BI | `/painel` + Fidelidade › Indicadores | **Funde**: vira a home do Analytics |

Contagem: **6 continuam ou fundem sem tela nova**, **7 ampliam o que existe**, **11 são novos** (3 de baixa prioridade), 1 não fazer agora e 1 só estrutura.

## 6. A aba Analytics

- Novo item na barra lateral: **Analytics**, no lugar de **Relatórios**. Os PDFs executivos de Marketing e Financeiro continuam, como a aba "Executivo".
- Abas: **Visão geral** (dashboard #26) · **Clientes** · **Frequência** · **Financeiro** · **Vendas** · **Aulas** · **CRM** · **Auditoria** · **Executivo**.
- Um componente de relatório só, reaproveitado por todas as telas: filtros (período, vendedor, professor), tabela paginada com busca e exportação CSV/Excel. A exportação usa `src/lib/relatorios/planilha.ts` e `pdf.ts`, que já existem e têm teste.
- **Camada de dados:** uma função tipada por relatório em `src/lib/analytics/<relatorio>.ts`, usada pela tela, pela exportação e por uma rota `/api/analytics/<relatorio>` (para agentes de IA). As agregações pesadas (fluxo de caixa, frequência, DRE) ficam em **views SQL** criadas por migration. O prompt pede uma função SQL `report_<nome>()` por relatório; proponho esse híbrido porque mantém tudo testável no Vitest. Ver pergunta 7.
- Permissão: ADMIN vê tudo. RECEPÇÃO vê Clientes, Frequência e CRM. Financeiro e Bancos só ADMIN.

## 7. Execução proposta (depois da aprovação)

1. **Migrations + staging + `ImportRun`/`ImportIssue`.** Rodar em dev.
2. **`scripts/migracao/importar-cloudgym.ts --dry-run`**: gera o relatório de validação completo (contagens, divergências, issues). Revisamos juntos.
3. **Import em dev**, com testes Vitest para cada transformação (CPF, telefone E.164, nome, cidade, `plan` com `|`, vínculo do check-in, mascaramento do cartão).
4. **Import em produção** com `--apply`. As migrations entram à mão (`db:migrate:deploy`); produção não roda migração no deploy.
5. **Reconciliação com a base atual:** 220 ativos novos, 110 que viraram inativos, `Payment` da última parcela (B1).
6. **Aba Analytics** em fatias: Visão geral + Clientes + Frequência → Financeiro → Vendas/CRM/Aulas → Auditoria.
7. **README `docs/migracao-cloudgym.md`** explicando como reimportar.

## 8. Perguntas que travam a aprovação

1. **Códigos de forma de pagamento fora da lista do prompt.** Proposta: `CC` (8.574 parcelas, quase todas via Stone/Pagar.me) = cartão recorrente/online; `BT` (3.221) = transferência/PIX; `OC` (1, no PDV) = fiado/crédito em conta. Confirma?
2. **`tipo` da parcela** = `i` (20.116) ou `e` (18), e 64.738 vazias. Suspeita: `i` = parcela de contrato, `e` = estorno ou avulsa. Sabe o que significam?
3. **`campo_15`** só traz `stone` / `pagarme` → proposta de nome: `gateway`.
4. **220 ativos que o Coliseu não tem:** criar todos? Atenção: a face deles pode já estar no iDFace com id do CloudGym. Se estiver, rodamos a adoção como em julho, em vez de cadastrar do zero.
5. **110 alunos do Coliseu que estão inativos no CloudGym:** marcar a matrícula como EXPIRED? No corte, a catraca bloqueia esses alunos.
6. **Escopo:** pular Estoque (#20) e deixar PDV/NF (#16, #19) para o fim?
7. **Camada de relatório:** o híbrido proposto (funções TypeScript + views SQL só onde pesa) ou uma função SQL por relatório, como o prompt pede?

---

## 9. Respostas e decisões de implementação (2026-10-05)

**Respostas do Alex (conferidas no CloudGym):**
- Formas de pagamento: `CC` Débito Recorrente (só ele é recorrente; `ECC` é a maquininha), `ECD` débito, `BT` PIX/TED/Transf (somado com `PIXA` PIX Automático), `OC` Pendura (fiado), `BL`, `DN`, `CH`, `DC` débito em conta, `LC` local, `GP` Gympass, `TP` TotalPass, `OT` outros. `BT` com cartão/TID existe (2 em setembro): não usar a forma para deduzir se foi online.
- Tipo da parcela: `i` = mensalidade (desde 08/2020), `e` = taxa de adesão (confirmado: plano "ORFEU Semestral (recorrente) INAUGURAÇÃO" tem adesão R$ 30; "Black Coliseu 3 meses" tem adesão R$ 75 em 2 parcelas), vazio = legado. **Estorno é `status = canceled`**, não tipo.
- Criar os ativos novos; expirar os que viraram inativos (lista para a recepção em `usuarios/migracao/viraram-inativos.csv`); pular Estoque; NF e PDV no fim (export bruto das NFs fica arquivado: guarda fiscal de 5 anos); relatórios em TypeScript com SQL só nos pesados; gabarito = "Entrada de receita" de setembro nas três visões.

**Decisões tomadas na implementação:**
- **Mensalidade do plano = `price × months ÷ duration`.** `price` é cobrado a cada `months` meses e o contrato dura `duration`. Confere com todos os preços derivados das vendas em julho (FULL ANUAL 1788×1÷12 = 149).
- **Ex-alunos entram com a fase nova `exaluno`.** As telas do dia a dia carregam a base inteira em memória e ficam de fora; o Analytics lê direto. Ex-aluno que escreve no WhatsApp volta a ser lead (reativação). Alunos que já estavam no Coliseu e evadiram continuam `aluno` com matrícula EXPIRED.
- **Leads históricos em `LeadLegado`**, não na Captação (funil vivo).
- **Staging = os próprios CSVs arquivados**, não uma tabela `stg_*`: evita 500 mil linhas jsonb em produção sem ganho, e o import é idempotente por chave legada.
- **Matrícula nova nasce com a presença real** (último check-in), senão a regra "presença só avança" nunca corrigiria o padrão `now()`.
- **Ordem de produção obrigatória:** aplicar a migration `20261005120000_migracao_cloudgym_analytics` **antes** do merge no master. Ela é só aditiva (seguro com o código atual); o código novo sem ela quebra o app.

**Simulação contra produção (só leitura):** 810 clientes casam com quem já existe (CPF 672, celular+nome 128, nome 10) · 13.151 pessoas novas (181 ativos + 12.970 ex-alunos) · 109 matrículas a expirar · 609 matrículas atualizadas + 223 criadas · 0 diferença de preço nos 42 planos existentes · 818 pagamentos espelhados para a catraca (751 pagos, 63 atrasados, 4 a vencer) · 478 presenças atualizadas · check-ins por ano idênticos ao prompt, 99,4% vinculados · 880 issues (nascimento 520, CPF 229, email 131).
