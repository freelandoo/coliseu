# Corte CloudGym → Coliseu — plano de execução

**Data:** 2026-10-04 · **Base:** plano técnico [2026-07-16-migracao-cloudgym.md](2026-07-16-migracao-cloudgym.md) (Tasks 1, 4, 5, 6 feitas; falta a Task 7, o corte).

**Objetivo:** desligar o CloudGym e deixar o Coliseu como único dono do iDFace, da cobrança e da ficha do aluno, sem nenhum aluno recadastrar a face e sem barrar quem está em dia.

## Onde estamos (produção, consultada em 2026-10-04)

| Item | Estado |
|---|---|
| Pessoas | 721 alunos + 1.421 leads |
| Matrículas (mais recente por aluno) | 693 ACTIVE · 24 SUSPENDED · 4 PENDING_PAYMENT |
| Mappings no iDFace | 718 IN_SYNC · 7 PENDING |
| Planos | 13 ativos com preço · 26 arquivados (25 com R$ 0) |
| Agente da recepção | ONLINE, heartbeat de hoje |
| Giros recebidos | 2.948 no total, **último em 2026-07-24** |
| Comandos com falha | 24 UPSERT_USER (HTTP 400) · 5 ENROLL |
| Asaas | **sem `ASAAS_*` no Railway: roda em modo mock** |
| Alunos sem CPF válido | 21 de 721 |

## Bloqueadores (resolver antes do dia do corte)

**B1 — A política nega os 693 alunos adotados.** `carregarContextoAcesso` lê o último `Payment`; nenhum adotado tem `Payment` ⇒ `billingStatus = null` ⇒ cai no "fallback conservador" de `evaluateAccessEligibility` (DENIED). Hoje não aparece porque o iDFace ainda obedece ao CloudGym. No corte, qualquer reavaliação (matrícula, recalcular acesso, ack de UPSERT) enfileira DISABLE.
Correção recomendada: semear, para cada adotado ACTIVE, um `Payment` legado `PAID` com `dueDate = vencimentoPlano` (script de migração com `--dry-run` padrão, igual ao `adotar.ts`). Alternativa: regra na política para "ACTIVE sem cobrança e `vencimentoPlano` no futuro" ⇒ OK. Teste obrigatório: aluno adotado em dia → ALLOWED; vencido há mais de 5 dias → DENIED.

**B2 — Nada vence matrícula.** Não existe rotina que passe ACTIVE → EXPIRED/SUSPENDED quando `vencimentoPlano` passa. Hoje há 145 ACTIVE já vencidos (e 40 vencem nos próximos 30 dias). Com B1 resolvido por `Payment` legado, a carência de 5 dias cobre o vencimento; mesmo assim, a renovação precisa gerar a próxima cobrança.

**B3 — Giros pararam de chegar em 24/07.** O agente está online mas não envia `AccessEvent` há dois meses. Diagnosticar no PC da recepção (cursor `.agent-cursor-<DEVICE_ID>`, log do serviço `ColiseuAgent`, se o CloudGym reconfigurou o aparelho). Sem giros, não dá para validar o smoke nem alimentar presença/Freelandoo.

**B4 — 24 UPSERT_USER com HTTP 400.** Entender o payload recusado (`create_or_modify_objects`) antes de o Coliseu virar dono — no corte cada aluno novo passa por esse caminho.

**B5 — Cobrança real.** Decidir: Asaas em produção (`ASAAS_API_KEY`, `ASAAS_ENV=production`, `ASAAS_WEBHOOK_TOKEN` + webhook apontando para `/api/webhooks/asaas`) ou só balcão no início. Sem isso, o Coliseu não sabe quem pagou fora do balcão.

## Pendências de dados (paralelas)

1. **Preço dos 26 planos arquivados** — pedir a tabela à gestão; ativar só os que ainda se vendem.
2. **240 órfãos no iDFace** (ex-alunos que ainda passam) — decisão de 2026-07-20: excluir. O corte resolve isso (passo 8).
3. **21 alunos sem CPF** — completar na ficha (a Freelandoo também não os enxerga).
4. **4 adoções fracas** (Claudecy, Thiago, Luiz Henrique, Daniel Marcelino) e vencimento placeholder (Daniel, Yasmim) — revisar com a recepção.
5. **7 mappings PENDING + 3 UPSERT PENDING** — limpar ou deixar o corte reprocessar.
6. **Último export do CloudGym** no dia anterior ao corte: alunos ativos, vencimentos e contratos — para atualizar `vencimentoPlano` de quem renovou entre julho e o corte.

## Cronograma

### Semana 1 — destravar (remoto)
- B1 com teste + script aplicado em prod (dry-run revisado antes).
- B3 diagnóstico via AnyDesk; B4 reproduzir o 400 com um usuário de teste.
- Decisão de B5.

### Semana 2 — dados e ensaio
- Novo export do CloudGym → rodar `conciliar.ts` + atualização de vencimentos.
- Preços dos planos; CPFs faltantes; revisão das adoções fracas.
- **Ensaio no aparelho "TESTE"** ou com 3 usuários de teste no iDFace real: criar, habilitar, desabilitar, remover, cadastrar face — tudo pelo Coliseu, sem tocar no CloudGym.
- Treino da recepção: matricular, cobrar no balcão, renovar, cadastrar face, override manual.

### Semana 3 — corte (presencial, terça de manhã, baixo movimento)
Ordem não negociável:
1. Export pen drive **Sincronização** do iDFace (rollback). Sem isso, não segue.
2. Export final do CloudGym (alunos + financeiro) guardado fora do repo.
3. **Desligar a integração do CloudGym com o iDFace.** A partir daqui o aparelho tem um dono só.
4. Conferir `ACCESS_EXTERNAL_ID_FLOOR=11097953` (já está) e que nenhum id adotado o ultrapassa.
5. Aplicar a atualização de vencimentos do export final.
6. Disparar a reavaliação de acesso de todos os adotados e acompanhar a fila no `/acesso` (esperado: ENABLE para quem está em dia, DISABLE para inadimplentes/vencidos).
7. **Smoke com gente de verdade:** um aluno em dia entra; um vencido há mais de 5 dias é barrado; um em carência entra; um aluno novo é matriculado, cadastra face e entra após pagar. Giros aparecem no `/acesso`.
8. Remover os 240 órfãos (REMOVE_USER pelo agente com `device-ids-excluir.csv`, ou API do iDFace).
9. Recepção liberada para operar só no Coliseu. CloudGym fica em leitura.

**Rollback (janela passo 3 → 7):** reimportar o pen drive e religar o CloudGym.

### Semanas 4–5 — acompanhamento
- Diário: fila de comandos sem DEAD_LETTER, giros chegando, reclamações na recepção.
- Recadastro presencial dos ativos sem face (~86 na conciliação de julho).
- Cancelar o CloudGym ao fim de 30 dias sem rollback.
- LGPD: apagar `backup-faces-idface-2026-07-17.zip` e as fotos do pen drive; manter só o export Sincronização até o cancelamento do CloudGym.

## Critério de pronto
- CloudGym desligado do iDFace e cancelado.
- Zero aluno em dia barrado na primeira semana; inadimplente barrado após a carência.
- Giros e pagamentos aparecem no Coliseu no mesmo dia.
- Órfãos removidos do aparelho; backups biométricos apagados.
